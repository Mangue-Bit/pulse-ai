"""C07: fila do profissional, com prazo.

Dúvida clínica só tem resposta humana. Nenhum agente redige. Se o prazo vencer
sem resposta, a dúvida atravessa a fronteira para a trilha de urgência (U02).
"""

from datetime import datetime

from sqlmodel import Session, col, select

from app import banco, rastro, relogio
from app.contratos import DuvidaVencida, MensagemAprovada, RelatoEstruturado
from app.regras.limites import PRAZO_DA_DUVIDA, em_palavras


def abrir(ctx: rastro.Contexto, relato: RelatoEstruturado) -> banco.Duvida:
    agora = relogio.agora()
    duvida = banco.Duvida(
        id=banco.novo_id("duv"), paciente_id=relato.paciente_id, relato_id=relato.id,
        texto=relato.trecho_literal, prazo=agora + PRAZO_DA_DUVIDA,
        interacao_id=ctx.interacao_id, criado_em=agora,
    )
    ctx.sessao.add(duvida)
    ctx.sessao.commit()
    ctx.evento("C07", "regra", saida={
        "duvida_id": duvida.id, "prazo": duvida.prazo,
        "resumo": f"Dúvida na fila do profissional, com prazo de {em_palavras(PRAZO_DA_DUVIDA)}.",
    })
    return duvida


def listar(s: Session) -> list[banco.Duvida]:
    return list(s.exec(select(banco.Duvida).order_by(col(banco.Duvida.criado_em).desc())).all())


def responder(s: Session, duvida: banco.Duvida, profissional: str, resposta: str) -> MensagemAprovada:
    """Registra a resposta do profissional e devolve a mensagem que vai ao paciente (E13)."""
    agora = relogio.agora()
    duvida.status = "respondida"
    duvida.resposta = resposta
    duvida.respondida_por = profissional
    duvida.respondida_em = agora
    s.add(duvida)
    s.commit()
    rastro.registrar_evento(
        s, etapa="C07", ator="pessoa", paciente_id=duvida.paciente_id, interacao_id=duvida.interacao_id,
        entrada={"duvida_id": duvida.id},
        saida={"respondida_por": profissional,
               "resumo": "O profissional respondeu a dúvida. O texto é dele, sem redação de agente."},
    )
    return MensagemAprovada(
        id=banco.novo_id("msg"), proposta_id=duvida.id, paciente_id=duvida.paciente_id, canal="texto",
        texto=resposta, aprovada_por=profissional, aprovada_em=agora,
        chave_unica=f"{duvida.id}:resposta_do_profissional",
    )


def vencer_prazos(s: Session, agora: datetime) -> list[DuvidaVencida]:
    """Marca as dúvidas abertas com prazo vencido e devolve o que atravessa para U02."""
    vencidas = []
    abertas = s.exec(select(banco.Duvida).where(banco.Duvida.status == "aberta", banco.Duvida.prazo < agora)).all()
    for duvida in abertas:
        duvida.status = "vencida"
        duvida.vencida_em = agora
        s.add(duvida)
        s.commit()
        rastro.registrar_evento(
            s, etapa="C07", ator="regra", paciente_id=duvida.paciente_id, interacao_id=duvida.interacao_id,
            entrada={"duvida_id": duvida.id},
            saida={"vencida": True,
                   "resumo": "O prazo da dúvida venceu sem resposta. Atravessa a fronteira para a trilha de urgência."},
        )
        vencidas.append(DuvidaVencida(
            id=duvida.id, paciente_id=duvida.paciente_id, relato_id=duvida.relato_id,
            prazo=duvida.prazo, vencida_em=agora,
        ))
    return vencidas


def para_visao(s: Session, duvida: banco.Duvida) -> dict:
    paciente = s.get(banco.Paciente, duvida.paciente_id)
    return {
        **duvida.model_dump(exclude={"interacao_id", "relato_id"}),
        "paciente_nome": paciente.nome if paciente else "",
    }
