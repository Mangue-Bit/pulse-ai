"""Ferramentas do Cuidado e execução (C28 a C33).

O Cuidado só age por estas quatro funções, e só depois da aprovação humana. A
chave única, derivada da proposta e do nome da ferramenta, impede a execução
duplicada: a gravação em `execucao` falha se a chave já existir.
"""

from collections.abc import Callable
from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app import banco, rastro, relogio
from app.contratos import MensagemAprovada
from app.regras.limites import PRAZO_DO_RESULTADO, TENTATIVAS_DE_EXECUCAO


class FalhaDeFerramenta(Exception):
    """A ferramenta não confirmou a ação."""


Entrega = Callable[[rastro.Contexto, dict], bool]
_entrega: Entrega | None = None


def definir_entrega(entrega: Entrega | None) -> None:
    """Liga a ferramenta `enviar_mensagem` à porta de entrega da fronteira (C28 -> E13)."""
    global _entrega
    _entrega = entrega


def chave_unica(proposta: banco.Proposta) -> str:
    return f"{proposta.id}:{proposta.ferramenta}"


# --- As quatro ferramentas -----------------------------------------------------

def enviar_mensagem(ctx: rastro.Contexto, proposta: banco.Proposta, aprovada_por: str) -> dict:
    argumentos = proposta.argumentos
    mensagem = MensagemAprovada(
        id=banco.novo_id("msg"), proposta_id=proposta.id, paciente_id=argumentos["paciente_id"],
        canal=argumentos["canal"], texto=argumentos["texto"], aprovada_por=aprovada_por,
        aprovada_em=proposta.decidida_em or relogio.agora(), chave_unica=chave_unica(proposta),
    )
    if _entrega is None:
        raise FalhaDeFerramenta("canal de entrega não configurado")
    if not _entrega(ctx, mensagem.model_dump(mode="json")):
        raise FalhaDeFerramenta("a mensagem não foi entregue ao paciente")
    return {"mensagem_id": mensagem.id, "canal": mensagem.canal, "entregue": True}


def criar_tarefa_acs(ctx: rastro.Contexto, proposta: banco.Proposta, aprovada_por: str) -> dict:
    argumentos = proposta.argumentos
    prazo = argumentos.get("prazo")
    tarefa = banco.TarefaAcs(
        id=banco.novo_id("tar"), paciente_id=argumentos["paciente_id"], acs_id=argumentos["acs_id"],
        caso_id=proposta.caso_id, proposta_id=proposta.id, tipo=argumentos["tipo"],
        descricao=argumentos["descricao"], prazo=datetime.fromisoformat(prazo) if prazo else None,
        origem="ferramenta", criado_em=relogio.agora(),
    )
    ctx.sessao.add(tarefa)
    ctx.sessao.commit()
    return {"tarefa_id": tarefa.id, "acs_id": tarefa.acs_id}


def salvar_relatorio(ctx: rastro.Contexto, proposta: banco.Proposta, aprovada_por: str) -> dict:
    argumentos = proposta.argumentos
    relatorio = banco.Relatorio(
        id=banco.novo_id("rel"), paciente_id=argumentos["paciente_id"], caso_id=proposta.caso_id,
        proposta_id=proposta.id, frases=argumentos["frases"], criado_em=relogio.agora(),
    )
    ctx.sessao.add(relatorio)
    ctx.sessao.commit()
    return {"relatorio_id": relatorio.id, "frases": len(relatorio.frases)}


def atualizar_lista(ctx: rastro.Contexto, proposta: banco.Proposta, aprovada_por: str) -> dict:
    argumentos = proposta.argumentos
    lista = ctx.sessao.get(banco.ListaTerritorio, argumentos["microarea_id"]) or banco.ListaTerritorio(
        microarea_id=argumentos["microarea_id"], atualizado_em=relogio.agora(),
    )
    lista.itens = argumentos["itens"]
    lista.atualizado_em = relogio.agora()
    ctx.sessao.add(lista)
    ctx.sessao.commit()
    return {"microarea_id": lista.microarea_id, "itens": len(lista.itens)}


FERRAMENTAS: dict[str, Callable[[rastro.Contexto, banco.Proposta, str], dict]] = {
    "enviar_mensagem": enviar_mensagem,
    "criar_tarefa_acs": criar_tarefa_acs,
    "salvar_relatorio": salvar_relatorio,
    "atualizar_lista": atualizar_lista,
}

# C31, C32 e C33: o que cada ferramenta confirma, e a etapa que registra.
CONFIRMACAO = {
    "enviar_mensagem": ("C31", "Intervenção feita: mensagem entregue ao paciente."),
    "criar_tarefa_acs": ("C31", "Intervenção feita: ACS acionado com a tarefa."),
    "salvar_relatorio": ("C32", "Relatório do paciente salvo no histórico."),
    "atualizar_lista": ("C33", "Listas do território atualizadas: nominal para o ACS, agregada para o gestor."),
}


# --- Execução ------------------------------------------------------------------

def _reservar(s: Session, proposta: banco.Proposta) -> banco.Execucao | None:
    """Grava a execução com a chave única. Devolve None se a chave já existir."""
    execucao = banco.Execucao(
        id=banco.novo_id("exe"), proposta_id=proposta.id, ferramenta=proposta.ferramenta,
        chave_unica=chave_unica(proposta), status="em_andamento", tentativas=0, criado_em=relogio.agora(),
    )
    s.add(execucao)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        return None
    return execucao


def executar(ctx: rastro.Contexto, caso: banco.Caso, proposta: banco.Proposta, aprovada_por: str) -> banco.Execucao:
    """C28 a C30: executa a ferramenta da proposta aprovada, uma única vez."""
    s = ctx.sessao
    if proposta.ferramenta not in FERRAMENTAS:
        raise FalhaDeFerramenta(f"ferramenta desconhecida: {proposta.ferramenta}")
    if proposta.estado not in ("aprovada", "editada", "executada", "falhou"):
        raise FalhaDeFerramenta("proposta sem aprovação humana não é executada")

    execucao = _reservar(s, proposta)
    if execucao is None:
        existente = s.exec(select(banco.Execucao).where(
            banco.Execucao.chave_unica == chave_unica(proposta))).one()
        ctx.evento("C28", "ferramenta", entrada={"proposta_id": proposta.id}, saida={
            "ferramenta": proposta.ferramenta, "chave_unica": existente.chave_unica, "duplicada": True,
            "resumo": "A chave única já foi usada: a ferramenta não roda de novo e nada é enviado em dobro.",
        })
        return existente

    resultado = None
    erro = ""
    while execucao.tentativas < TENTATIVAS_DE_EXECUCAO and resultado is None:
        execucao.tentativas += 1
        ctx.evento("C28", "ferramenta", entrada={"proposta_id": proposta.id, "aprovada_por": aprovada_por}, saida={
            "ferramenta": proposta.ferramenta, "chave_unica": execucao.chave_unica,
            "tentativa": execucao.tentativas,
            "resumo": f"Ferramenta {proposta.ferramenta} executada com a chave única da proposta"
                      f" (tentativa {execucao.tentativas} de {TENTATIVAS_DE_EXECUCAO}).",
        })
        try:
            resultado = FERRAMENTAS[proposta.ferramenta](ctx, proposta, aprovada_por)
        except FalhaDeFerramenta as falha:
            erro = str(falha)
            s.rollback()
            # C29 e C30: execução não confirmada, a falha fica à vista
            ctx.evento("C29", "regra", saida={"decisao": "não", "resumo": f"Execução não confirmada: {erro}."})
            restam = TENTATIVAS_DE_EXECUCAO - execucao.tentativas
            ctx.evento("C30", "regra", saida={
                "erro": erro, "tentativa": execucao.tentativas, "tentativas_restantes": restam,
                "resumo": f"Falha na execução: {erro}. "
                          + (f"Nova tentativa com a mesma chave ({restam} restante(s))." if restam
                             else "Tentativas esgotadas: vira tarefa manual."),
            })

    if resultado is None:
        execucao.status = "falhou"
        execucao.resultado = {"erro": erro}
        proposta.estado = "falhou"
        proposta.motivo = f"A execução falhou {TENTATIVAS_DE_EXECUCAO} vezes: {erro}."
        s.add(execucao)
        s.add(proposta)
        s.commit()
        from app.cuidado import orquestrador

        caso.status = "aberto"
        orquestrador.tarefa_manual(ctx, caso, f"A ferramenta {proposta.ferramenta} falhou {TENTATIVAS_DE_EXECUCAO} vezes.")
        return execucao

    execucao.status = "confirmada"
    execucao.resultado = resultado
    proposta.estado = "executada"
    s.add(execucao)
    s.add(proposta)
    s.commit()
    ctx.evento("C29", "regra", saida={
        "decisao": "sim", **resultado, "resumo": "Execução confirmada pelo retorno da ferramenta.",
    })
    etapa, resumo = CONFIRMACAO[proposta.ferramenta]
    ctx.evento(etapa, "ferramenta", saida={"proposta_id": proposta.id, **resultado, "resumo": resumo})

    agora = relogio.agora()
    if proposta.especialista == "intervencao":
        caso.status = "aguardando_resultado"
        caso.recebeu_intervencao = True
        caso.validade = agora + PRAZO_DO_RESULTADO
        caso.lembrete_resultado_em = None
    elif caso.status == "aguardando_aprovacao":
        caso.status = "aberto"
        caso.validade = None
    caso.atualizado_em = agora
    s.add(caso)
    s.commit()
    return execucao
