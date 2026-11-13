"""Desfecho e rodadas (C34 a C39).

O registro do resultado pelo ACS encerra o caso, abre nova rodada ou leva à
busca ativa. Os limites de rodada são regra: 2 para paciente de alto risco, 3
para os demais.
"""

from datetime import datetime, timedelta

from sqlmodel import Session, col, select

from app import banco, rastro, relogio
from app.cuidado import aprendizado
from app.regras.limites import PRAZO_DA_TAREFA, limite_de_rodadas

MARCA_DE_NOVA_RODADA = "aguardando nova rodada"
PRAZO_APOS_O_LEMBRETE = timedelta(days=2)


class ResultadoInvalido(Exception):
    """O caso não está aguardando resultado."""


def _ultima_intervencao(s: Session, caso_id: str) -> banco.Proposta | None:
    return s.exec(
        select(banco.Proposta)
        .where(banco.Proposta.caso_id == caso_id, banco.Proposta.especialista == "intervencao",
               banco.Proposta.estado == "executada")
        .order_by(col(banco.Proposta.criado_em).desc())
    ).first()


def registrar_resultado(s: Session, caso_id: str, acs_id: str, barreira_resolvida: bool, observacao: str) -> banco.Caso:
    """C34, C36 e o que vem depois: resolvido (C37), nova rodada (C38) ou busca ativa (C39)."""
    caso = s.get(banco.Caso, caso_id)
    if caso is None:
        raise LookupError("Caso não encontrado.")
    if caso.status != "aguardando_resultado":
        raise ResultadoInvalido("O caso não está aguardando o registro de resultado.")
    agora = relogio.agora()
    proposta = _ultima_intervencao(s, caso.id)
    resultado = banco.Resultado(
        id=banco.novo_id("res"), caso_id=caso.id, proposta_id=proposta.id if proposta else None,
        item_catalogo_id=proposta.item_catalogo_id if proposta else None,
        barreira_resolvida=barreira_resolvida, observacao=observacao.strip(),
        registrado_por=acs_id, criado_em=agora,
    )
    s.add(resultado)
    s.commit()

    ctx = rastro.nova_interacao(s, caso.paciente_id, caso.id)
    ctx.evento("C34", "pessoa", entrada={"acs_id": acs_id, "observacao": observacao.strip()}, saida={
        "decisao": "sim", "resultado_id": resultado.id,
        "resumo": "O ACS registrou o resultado da ação dentro do prazo.",
    })
    ctx.evento("C36", "regra", saida={
        "decisao": "sim" if barreira_resolvida else "não",
        "resumo": "A barreira foi superada." if barreira_resolvida else "A barreira não foi superada.",
    })
    caso.validade = None
    caso.atualizado_em = agora

    if barreira_resolvida:
        # C37: caso encerrado, resolvido
        caso.status, caso.desfecho = "resolvido", "resolvido"
        s.add(caso)
        s.commit()
        ctx.evento("C37", "regra", saida={
            "resumo": "Caso encerrado como resolvido. Sai da fila, e o resultado fica no histórico.",
        })
        aprendizado.registrar(ctx, caso, resultado)
        return caso

    # C38: atingiu o limite de rodadas?
    paciente = s.get(banco.Paciente, caso.paciente_id)
    limite = limite_de_rodadas(paciente.alto_risco)
    atingiu = caso.rodada >= limite
    ctx.evento("C38", "regra", saida={
        "decisao": "sim" if atingiu else "não", "rodada": caso.rodada, "limite": limite,
        "alto_risco": paciente.alto_risco,
        "resumo": f"Rodada {caso.rodada} de {limite} ({'alto risco' if paciente.alto_risco else 'demais pacientes'}): "
                  + ("limite atingido." if atingiu else "ainda cabe nova rodada, pela checagem por tempo."),
    })
    if atingiu:
        # C39: busca ativa presencial
        caso.status, caso.desfecho = "busca_ativa", "busca_ativa"
        tarefa = banco.TarefaAcs(
            id=banco.novo_id("tar"), paciente_id=caso.paciente_id, acs_id=paciente.acs_id, caso_id=caso.id,
            tipo="busca_ativa", origem="manual",
            descricao=f"Busca ativa presencial de {paciente.nome.split()[0]} e discussão do caso na reunião de equipe.",
            prazo=agora + PRAZO_DA_TAREFA, criado_em=agora,
        )
        s.add(tarefa)
        s.add(caso)
        s.commit()
        ctx.evento("C39", "regra", saida={
            "tarefa_id": tarefa.id,
            "resumo": "Limite de rodadas atingido: busca ativa presencial e reunião de equipe. O caso sai do fluxo automático.",
        })
        aprendizado.registrar(ctx, caso, resultado)
        return caso

    caso.status = "aberto"
    caso.rodada += 1
    caso.pendencias = [*caso.pendencias, MARCA_DE_NOVA_RODADA]
    s.add(caso)
    s.commit()
    aprendizado.registrar(ctx, caso, resultado)
    return caso


def checar_prazos(s: Session, agora: datetime) -> list[dict]:
    """C35 (sem registro de resultado) e os gatilhos de nova rodada para a checagem por tempo (C03)."""
    disparos: list[dict] = []
    aguardando = s.exec(select(banco.Caso).where(
        banco.Caso.status == "aguardando_resultado", col(banco.Caso.validade).is_not(None),
        banco.Caso.validade < agora,
    )).all()
    for caso in aguardando:
        ctx = rastro.nova_interacao(s, caso.paciente_id, caso.id)
        ctx.evento("C34", "regra", saida={
            "decisao": "não", "resumo": "O prazo venceu sem registro do resultado.",
        })
        if caso.lembrete_resultado_em is None:
            caso.lembrete_resultado_em = agora
            caso.validade = agora + PRAZO_APOS_O_LEMBRETE
            ctx.evento("C35", "regra", saida={
                "lembrete": True, "resumo": "Sem registro no prazo: o ACS foi lembrado uma vez.",
            })
            disparos.append({"tipo": "lembrete_de_resultado", "descricao": "ACS lembrado de registrar o resultado.",
                             "caso_id": caso.id, "paciente_id": caso.paciente_id})
        else:
            caso.status, caso.desfecho, caso.validade = "aberto", "sem_registro", None
            caso.pendencias = [*caso.pendencias, "ação executada, sem registro de resultado"]
            ctx.evento("C35", "regra", saida={
                "sem_registro": True,
                "resumo": "O lembrete não teve resposta: caso marcado como sem registro, o que não conta como falha.",
            })
            disparos.append({"tipo": "sem_registro", "descricao": "Caso marcado como sem registro de resultado.",
                             "caso_id": caso.id, "paciente_id": caso.paciente_id})
        caso.atualizado_em = agora
        s.add(caso)
        s.commit()

    for caso in s.exec(select(banco.Caso).where(banco.Caso.status == "aberto")).all():
        if MARCA_DE_NOVA_RODADA in caso.pendencias:
            caso.pendencias = [p for p in caso.pendencias if p != MARCA_DE_NOVA_RODADA]
            s.add(caso)
            s.commit()
            disparos.append({"tipo": "nova_rodada", "descricao": f"Nova rodada do caso {caso.id}.",
                             "nova_rodada": True, "caso_id": caso.id, "paciente_id": caso.paciente_id})
    return disparos
