"""Orquestrador do Cuidado (C08 a C17).

Abre ou retoma o caso, guarda o estado compartilhado, busca o contexto, delega
ao especialista e consolida as saídas. Em conflito, a regra vence o modelo e a
equipe vence os dois.
"""

from typing import TYPE_CHECKING

from pydantic import BaseModel
from sqlmodel import Session, col, select

from app import banco, modelo, rastro, relogio
from app.contratos import Especialista, EstadoDoCaso, Fonte
from app.cuidado import aprovacao, rag, verificador
from app.cuidado.especialistas import intervencao, relatorio
from app.regras.limites import PRAZO_DA_TAREFA

if TYPE_CHECKING:
    from app.cuidado.entrada import Entrada

PONTO = "delegar"
TAREFA = (
    "Decida qual especialista deve tratar a entrada descrita nos blocos de dado abaixo "
    "e se falta alguma informação indispensável para seguir."
)
CASOS_EM_ANDAMENTO = ("aberto", "aguardando_aprovacao", "aguardando_resultado", "suspenso")

# Regra de delegação (C15): o tipo de entrada define quais especialistas podem atuar.
ESPECIALISTAS_POR_ENTRADA: dict[str, tuple[str, ...]] = {
    "relato": ("intervencao",),
    "risco": ("intervencao",),
    "registro_acs": ("relatorio",),
    "tempo": ("intervencao",),
}


class Delegacao(BaseModel):
    especialistas: list[Especialista]
    informacao_faltante: str | None


# --- C09: estado do caso -------------------------------------------------------

def estado_do_caso(s: Session, caso: banco.Caso) -> EstadoDoCaso:
    paciente = s.get(banco.Paciente, caso.paciente_id)
    return EstadoDoCaso(
        caso_id=caso.id, paciente_id=caso.paciente_id, microarea_id=caso.microarea_id,
        status=caso.status, situacao_paciente=paciente.situacao if paciente else "ativo",
        rodada=caso.rodada, pendencias=list(caso.pendencias), validade=caso.validade,
    )


def caso_em_andamento(s: Session, paciente_id: str) -> banco.Caso | None:
    return s.exec(
        select(banco.Caso)
        .where(banco.Caso.paciente_id == paciente_id, col(banco.Caso.status).in_(CASOS_EM_ANDAMENTO))
        .order_by(col(banco.Caso.aberto_em).desc())
    ).first()


def gravar_estado(ctx: rastro.Contexto, caso: banco.Caso, motivo: str) -> None:
    """Grava o caso e registra o estado compartilhado no rastro (C09)."""
    caso.atualizado_em = relogio.agora()
    ctx.sessao.add(caso)
    ctx.sessao.commit()
    estado = estado_do_caso(ctx.sessao, caso)
    ctx.evento("C09", "regra", saida={
        **estado.model_dump(), "barreira": caso.barreira,
        "resumo": f"Estado do caso gravado: {estado.status}, rodada {estado.rodada}. {motivo}",
    })


# --- C08: abre ou retoma o caso -----------------------------------------------

def _abrir_ou_retomar(ctx: rastro.Contexto, entrada: "Entrada", paciente: banco.Paciente) -> banco.Caso:
    agora = relogio.agora()
    caso = caso_em_andamento(ctx.sessao, paciente.id)
    barreira = entrada.relato.barreira if entrada.relato else None
    if caso is None:
        caso = banco.Caso(
            id=banco.novo_id("cas"), paciente_id=paciente.id, microarea_id=paciente.microarea_id,
            status="aberto", rodada=1, pendencias=[], barreira=barreira, aberto_em=agora, atualizado_em=agora,
        )
        acao = "aberto"
    else:
        acao = "retomado"
        if barreira and barreira != "nao_identificada":
            caso.barreira = barreira
    ctx.sessao.add(caso)
    ctx.sessao.commit()
    ctx.vincular_caso(caso.id)
    ctx.evento("C08", "regra", entrada={"tipo_de_entrada": entrada.tipo}, saida={
        "caso_id": caso.id, "acao": acao, "microarea_id": caso.microarea_id,
        "resumo": f"Caso {acao} pelo orquestrador para o paciente, na microárea {caso.microarea_id}.",
    })
    return caso


# --- C11: suspende a fila ------------------------------------------------------

def suspender_fila(s: Session, paciente_id: str, motivo: str, ctx: rastro.Contexto | None = None) -> int:
    """Cancela as propostas pendentes do paciente e suspende os casos em andamento."""
    canceladas = aprovacao.cancelar_pendentes(s, paciente_id, motivo)
    for caso in s.exec(select(banco.Caso).where(
        banco.Caso.paciente_id == paciente_id,
        col(banco.Caso.status).in_(("aberto", "aguardando_aprovacao")),
    )).all():
        caso.status = "suspenso"
        caso.atualizado_em = relogio.agora()
        s.add(caso)
    s.commit()
    caso_atual = caso_em_andamento(s, paciente_id)
    registro = ctx or rastro.nova_interacao(s, paciente_id, caso_atual.id if caso_atual else None)
    registro.evento("C11", "regra", saida={
        "propostas_canceladas": canceladas, "motivo": motivo,
        "resumo": f"Fila do paciente suspensa: {motivo}. Propostas pendentes canceladas: {canceladas}.",
    })
    return canceladas


def retomar_fila(s: Session, paciente_id: str) -> None:
    """Devolve à fila os casos suspensos quando o paciente volta a ficar ativo."""
    for caso in s.exec(select(banco.Caso).where(
        banco.Caso.paciente_id == paciente_id, banco.Caso.status == "suspenso",
    )).all():
        caso.status = "aberto"
        caso.atualizado_em = relogio.agora()
        s.add(caso)
    s.commit()


# --- C17: sem item ou ferramenta ----------------------------------------------

def tarefa_manual(ctx: rastro.Contexto, caso: banco.Caso, motivo: str) -> banco.TarefaAcs:
    """Nada no catálogo resolve, ou o agente não pôde propor: vira tarefa manual da equipe."""
    paciente = ctx.sessao.get(banco.Paciente, caso.paciente_id)
    agora = relogio.agora()
    tarefa = banco.TarefaAcs(
        id=banco.novo_id("tar"), paciente_id=caso.paciente_id, acs_id=paciente.acs_id, caso_id=caso.id,
        tipo="tarefa_manual",
        descricao=f"Caso sem proposta automática: {motivo} Avaliar com a equipe e conversar com {paciente.nome.split()[0]}.",
        prazo=agora + PRAZO_DA_TAREFA, origem="manual", criado_em=agora,
    )
    ctx.sessao.add(tarefa)
    caso.pendencias = [*caso.pendencias, f"tarefa manual: {motivo}"]
    ctx.sessao.add(caso)
    ctx.sessao.commit()
    ctx.evento("C17", "regra", saida={
        "tarefa_id": tarefa.id, "motivo": motivo,
        "resumo": f"Sem proposta automática: virou tarefa manual da equipe. {motivo}",
    })
    return tarefa


# --- C13 e C15: ponto de chamada 2 --------------------------------------------

def _delegar(ctx: rastro.Contexto, caso: banco.Caso, entrada: "Entrada", fontes: list[Fonte]) -> list[str] | None:
    """Devolve os especialistas que vão atuar, ou None se o caso vai para tarefa manual."""
    permitidos = ESPECIALISTAS_POR_ENTRADA[entrada.tipo]

    # Regras antes do modelo.
    if not fontes:
        ctx.evento("C13", "regra", saida={
            "decisao": "não", "resumo": "A busca não trouxe nenhum trecho com fonte para este caso.",
        })
        tarefa_manual(ctx, caso, "Não há contexto com fonte para sustentar uma proposta.")
        return None
    if entrada.tipo == "relato" and caso.barreira in (None, "nao_identificada"):
        ctx.evento("C13", "regra", saida={
            "decisao": "não", "resumo": "A barreira não foi identificada: falta informação para escolher uma intervenção.",
        })
        tarefa_manual(ctx, caso, "A barreira do relato não foi identificada.")
        return None

    mensagem = modelo.montar_mensagem(TAREFA, {
        "tipo_de_entrada": entrada.tipo,
        "estado_do_caso": {**estado_do_caso(ctx.sessao, caso).model_dump(mode="json"), "barreira": caso.barreira},
        "texto_da_entrada": entrada.texto,
        "contexto_recuperado": [f.model_dump() for f in fontes],
    })
    resultado = modelo.chamar_estruturado(PONTO, mensagem, Delegacao)
    if not resultado.ok:
        ctx.evento("C13", "modelo", saida={
            **resultado.resumo(),
            "resumo": f"A chamada ao modelo falhou ({resultado.falha}). O caso segue para o caminho humano.",
        }, chamada=resultado.metricas)
        tarefa_manual(ctx, caso, "O orquestrador não conseguiu delegar o caso.")
        return None

    delegacao: Delegacao = resultado.saida
    if delegacao.informacao_faltante:
        ctx.evento("C13", "modelo", saida={
            "decisao": "não", "informacao_faltante": delegacao.informacao_faltante,
            "resumo": "O orquestrador indicou que falta informação para seguir.",
        }, chamada=resultado.metricas)
        tarefa_manual(ctx, caso, f"Falta informação: {delegacao.informacao_faltante[:200]}")
        return None
    ctx.evento("C13", "modelo", saida={
        "decisao": "sim", "resumo": "Há informação suficiente para seguir.",
    }, chamada=resultado.metricas)

    # C15: a regra vence o modelo. Só vale especialista permitido para o tipo de entrada.
    escolhidos = [e for e in dict.fromkeys(delegacao.especialistas) if e in permitidos]
    corrigido = not escolhidos
    if corrigido:
        escolhidos = list(permitidos)
    ctx.evento("C15", "modelo", saida={
        "especialistas": escolhidos, "sugeridos_pelo_modelo": delegacao.especialistas,
        "corrigido_pela_regra": corrigido,
        "resumo": f"Delegado a: {', '.join(escolhidos)}."
        + (" A sugestão do modelo não valia para este tipo de entrada; a regra prevaleceu." if corrigido else ""),
    })
    return escolhidos


# --- Fluxo ---------------------------------------------------------------------

def tratar(ctx: rastro.Contexto, entrada: "Entrada") -> str | None:
    """C08 em diante, para uma entrada que não é alarme nem dúvida clínica."""
    s = ctx.sessao
    paciente = s.get(banco.Paciente, entrada.paciente_id)
    caso = _abrir_ou_retomar(ctx, entrada, paciente)
    gravar_estado(ctx, caso, "Entrada recebida.")

    # C10: paciente ativo?
    if paciente.situacao != "ativo":
        ctx.evento("C10", "regra", saida={
            "decisao": "não", "situacao": paciente.situacao,
            "resumo": f"Paciente não está ativo ({paciente.situacao}).",
        })
        suspender_fila(s, paciente.id, f"paciente {paciente.situacao.replace('_', ' ')}", ctx)
        return caso.id
    ctx.evento("C10", "regra", saida={"decisao": "sim", "resumo": "Paciente ativo: sem urgência nem internação."})

    if caso.status in ("aguardando_aprovacao", "aguardando_resultado"):
        gravar_estado(ctx, caso, "Já há uma ação em curso neste caso; a nova entrada fica anexada, sem proposta duplicada.")
        return caso.id

    # C12: recupera o contexto
    fontes = rag.recuperar(s, paciente, caso.barreira, entrada.texto)
    origens = [f.origem for f in fontes]
    ctx.evento("C12", "regra", entrada={"barreira": caso.barreira}, saida={
        "fontes": [{"id": f.id, "origem": f.origem, "titulo": f.titulo} for f in fontes],
        "resumo": f"{len(fontes)} trecho(s) recuperado(s): {origens.count('protocolo')} de protocolo, "
                  f"{origens.count('bulario')} do bulário e {origens.count('historico')} do histórico do paciente.",
    })

    especialistas = _delegar(ctx, caso, entrada, fontes)
    if especialistas is None:
        return caso.id

    propostas: list[banco.Proposta] = []
    for especialista in especialistas:
        proposta = None
        if especialista == "intervencao":
            proposta = intervencao.propor(ctx, caso, paciente, entrada, fontes)
        elif especialista == "relatorio":
            proposta = relatorio.propor(ctx, caso, paciente, entrada, fontes)
        if proposta is not None:
            propostas.append(proposta)

    # C16: consolida
    if not propostas:
        ctx.evento("C16", "regra", saida={
            "propostas": 0, "resumo": "Nenhum especialista devolveu proposta aplicável.",
        })
        tarefa_manual(ctx, caso, "Nenhum item do catálogo se aplica a este caso.")
        return caso.id
    ctx.evento("C16", "regra", saida={
        "propostas": [p.id for p in propostas],
        "resumo": f"{len(propostas)} proposta(s) consolidada(s) no caso. Segue para o verificador.",
    })

    for proposta in propostas:
        aprovada = verificador.verificar(ctx, caso, paciente, entrada, proposta, fontes)
        if aprovada is not None:
            aprovacao.enfileirar(ctx, caso, aprovada)
    return caso.id
