"""Relógio do sistema.

Todo prazo do Pulse é calculado a partir de agora(). Na demonstração o relógio
pode ser avançado: a lógica de prazo é a real, só o tempo é acelerado.
"""

from collections.abc import Callable
from datetime import datetime, timedelta

from sqlmodel import Session

from app import banco

Checagem = Callable[[Session, datetime], list[dict]]

_deslocamento: int | None = None
_checagens: list[Checagem] = []


def _carregar() -> int:
    global _deslocamento
    if _deslocamento is None:
        with banco.sessao() as s:
            registro = s.get(banco.Relogio, 1)
            _deslocamento = registro.deslocamento_segundos if registro else 0
    return _deslocamento


def recarregar() -> None:
    """Esquece o valor em memória. Usado quando o banco é recriado."""
    global _deslocamento
    _deslocamento = None


def deslocamento_minutos() -> int:
    return _carregar() // 60


def agora() -> datetime:
    return datetime.now().replace(microsecond=0) + timedelta(seconds=_carregar())


def registrar_checagem(checagem: Checagem) -> None:
    """Inscreve uma checagem por tempo, executada a cada avanço do relógio."""
    if checagem not in _checagens:
        _checagens.append(checagem)


def executar_checagens(sessao: Session) -> list[dict]:
    """Roda as checagens por tempo com o horário atual do sistema."""
    momento = agora()
    disparos: list[dict] = []
    for checagem in list(_checagens):
        disparos.extend(checagem(sessao, momento))
    return disparos


def avancar(sessao: Session, minutos: int) -> list[dict]:
    """Avança o relógio e dispara os prazos e as checagens por tempo."""
    global _deslocamento
    if minutos <= 0:
        raise ValueError("o relógio só avança")
    novo = _carregar() + minutos * 60
    registro = sessao.get(banco.Relogio, 1) or banco.Relogio(id=1)
    registro.deslocamento_segundos = novo
    sessao.add(registro)
    sessao.commit()
    _deslocamento = novo
    return executar_checagens(sessao)
