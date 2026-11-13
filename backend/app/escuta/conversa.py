"""Conversa do paciente: a memória curta da Escuta.

A Escuta lembra só da sessão em andamento. A conversa bruta tem data para
expirar, anterior à do histórico do Cuidado.
"""

from sqlmodel import Session, col, select

from app import banco, relogio
from app.regras.limites import JANELA_DA_SESSAO, RETENCAO_DA_CONVERSA


def sessao_atual(s: Session, paciente_id: str) -> str:
    """Identificador da sessão em andamento. Depois da janela de silêncio, começa outra."""
    ultima = s.exec(
        select(banco.Conversa)
        .where(banco.Conversa.paciente_id == paciente_id)
        .order_by(col(banco.Conversa.seq).desc())
    ).first()
    if ultima is not None and relogio.agora() - ultima.criado_em <= JANELA_DA_SESSAO:
        return ultima.sessao_id
    return banco.novo_id("ses")


def gravar(
    s: Session,
    *,
    paciente_id: str,
    sessao_id: str,
    autor: str,
    texto: str,
    tipo: str,
    etapa: str | None,
    canal: str = "texto",
) -> banco.Conversa:
    agora = relogio.agora()
    mensagem = banco.Conversa(
        id=banco.novo_id("msg"), paciente_id=paciente_id, sessao_id=sessao_id, autor=autor,
        canal=canal, texto=texto, tipo=tipo, etapa=etapa, criado_em=agora,
        expira_em=agora + RETENCAO_DA_CONVERSA,
    )
    s.add(mensagem)
    s.commit()
    return mensagem


def listar(s: Session, paciente_id: str) -> list[banco.Conversa]:
    """Mensagens ainda dentro do prazo de retenção, em ordem."""
    return list(s.exec(
        select(banco.Conversa)
        .where(banco.Conversa.paciente_id == paciente_id, banco.Conversa.expira_em > relogio.agora())
        .order_by(col(banco.Conversa.seq))
    ).all())


def esclarecimentos_na_sessao(s: Session, paciente_id: str, sessao_id: str) -> int:
    """Quantas vezes a Escuta já pediu esclarecimento nesta sessão (E07)."""
    return len(s.exec(
        select(banco.Conversa).where(
            banco.Conversa.paciente_id == paciente_id,
            banco.Conversa.sessao_id == sessao_id,
            banco.Conversa.etapa == "E07",
            banco.Conversa.autor == "pulse",
        )
    ).all())


def para_visao(mensagem: banco.Conversa) -> dict:
    return mensagem.model_dump(include={"id", "autor", "canal", "texto", "tipo", "etapa", "criado_em"})
