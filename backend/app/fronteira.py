"""Fronteira de permissão entre a Escuta e o Cuidado.

Este é o único módulo que conhece os dois lados. Os pacotes `escuta` e
`cuidado` não se importam: só quatro objetos atravessam por aqui, todos
definidos em `contratos.py`.

    RelatoEstruturado   Escuta (E12)   -> Cuidado (C04)
    SinalDeAlarme       Escuta (E03) ou Cuidado (C05) -> trilha de urgência (U01)
    DuvidaVencida       Cuidado (C07)  -> trilha de urgência (U02)
    MensagemAprovada    Cuidado (C28)  -> paciente (E13)
"""

from collections.abc import Callable

from sqlmodel import Session

from app import banco, rastro
from app.escuta import fluxo as escuta
from app.escuta.fluxo import ResultadoEscuta

Agendar = Callable[..., None]


def receber_mensagem_do_paciente(
    s: Session, paciente_id: str, texto: str, canal: str, agendar: Agendar,
) -> ResultadoEscuta:
    """Passa a mensagem pela Escuta e leva o que saiu dela ao outro lado da fronteira.

    `agendar` recebe o trabalho do Cuidado para rodar depois da resposta ao
    paciente: a conversa não espera o orquestrador.
    """
    resultado = escuta.processar_mensagem(s, paciente_id, texto, canal)
    if resultado.relato is not None:
        agendar(
            entregar_relato_ao_cuidado,
            resultado.relato.model_dump(mode="json"),
            resultado.contexto.interacao_id,
        )
    return resultado


def entregar_relato_ao_cuidado(relato: dict, interacao_id: str) -> None:
    """E12 -> C04. O relato atravessa como dado serializado e é validado de novo na chegada."""
    with banco.sessao() as s:
        ctx = rastro.Contexto(sessao=s, paciente_id=relato["paciente_id"], interacao_id=interacao_id)
        for destino in _destinos_do_relato:
            destino(ctx, relato)


_destinos_do_relato: list[Callable[[rastro.Contexto, dict], None]] = []
