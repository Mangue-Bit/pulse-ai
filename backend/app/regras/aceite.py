"""Regra do aceite: sem aceite válido, nenhuma mensagem sai.

A única exceção é a mensagem fixa de emergência (U01).
"""

from sqlmodel import Session, col, select

from app import banco, relogio


def aceite_vigente(sessao: Session, paciente_id: str) -> banco.Aceite | None:
    """O aceite mais recente do paciente, se estiver registrado e não revogado."""
    ultimo = sessao.exec(
        select(banco.Aceite)
        .where(banco.Aceite.paciente_id == paciente_id)
        .order_by(col(banco.Aceite.registrado_em).desc())
    ).first()
    if ultimo is None or ultimo.revogado_em is not None:
        return None
    return ultimo


def aceite_valido(sessao: Session, paciente_id: str) -> bool:
    return aceite_vigente(sessao, paciente_id) is not None


def registrar_aceite(sessao: Session, paciente_id: str) -> banco.Aceite:
    vigente = aceite_vigente(sessao, paciente_id)
    if vigente is not None:
        return vigente
    aceite = banco.Aceite(
        id=banco.novo_id("ace"), paciente_id=paciente_id, registrado_em=relogio.agora(),
    )
    sessao.add(aceite)
    paciente = sessao.get(banco.Paciente, paciente_id)
    if paciente is not None and paciente.situacao == "aceite_revogado":
        paciente.situacao = "ativo"
        sessao.add(paciente)
    sessao.commit()
    return aceite


def revogar_aceite(sessao: Session, paciente_id: str) -> bool:
    """Revoga o aceite vigente. Devolve False se não havia aceite válido."""
    vigente = aceite_vigente(sessao, paciente_id)
    if vigente is None:
        return False
    vigente.revogado_em = relogio.agora()
    sessao.add(vigente)
    paciente = sessao.get(banco.Paciente, paciente_id)
    if paciente is not None and paciente.situacao == "ativo":
        paciente.situacao = "aceite_revogado"
        sessao.add(paciente)
    sessao.commit()
    return True
