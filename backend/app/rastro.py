"""Rastro: toda etapa do fluxo registra um evento.

O rastro é a fonte da tela, das métricas e da investigação de respostas ruins.
"""

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, get_args

from pydantic import BaseModel
from sqlmodel import Session, col, select

from app import banco, contratos, relogio

_ETAPA = re.compile(r"^[ECUIRT]\d{2}$")
_ATORES = set(get_args(contratos.Ator))


@dataclass(frozen=True)
class MetricasChamada:
    """O que uma chamada ao modelo acrescenta ao evento."""

    modelo: str
    versao_prompt: str
    latencia_ms: int
    tokens_entrada: int
    tokens_saida: int
    custo: float


def _json(valor: Any) -> Any:
    if isinstance(valor, BaseModel):
        return _json(valor.model_dump())
    if isinstance(valor, dict):
        return {str(k): _json(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple, set)):
        return [_json(v) for v in valor]
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    return valor


def registrar_evento(
    sessao: Session,
    *,
    etapa: str,
    ator: str,
    paciente_id: str,
    caso_id: str | None = None,
    interacao_id: str | None = None,
    entrada: dict | None = None,
    saida: dict | None = None,
    chamada: MetricasChamada | None = None,
) -> banco.Evento:
    """Grava um evento do rastro e confirma a transação."""
    if not _ETAPA.match(etapa):
        raise ValueError(f"etapa desconhecida: {etapa!r}")
    if ator not in _ATORES:
        raise ValueError(f"ator desconhecido: {ator!r}")
    evento = banco.Evento(
        id=banco.novo_id("evt"),
        caso_id=caso_id,
        paciente_id=paciente_id,
        interacao_id=interacao_id,
        etapa=etapa,
        ator=ator,
        entrada=_json(entrada or {}),
        saida=_json(saida or {}),
        modelo=chamada.modelo if chamada else None,
        versao_prompt=chamada.versao_prompt if chamada else None,
        latencia_ms=chamada.latencia_ms if chamada else None,
        tokens_entrada=chamada.tokens_entrada if chamada else None,
        tokens_saida=chamada.tokens_saida if chamada else None,
        custo=chamada.custo if chamada else None,
        criado_em=relogio.agora(),
    )
    sessao.add(evento)
    sessao.commit()
    return evento


@dataclass
class Contexto:
    """Acompanha uma entrada pelo fluxo: paciente, interação e, quando existir, caso."""

    sessao: Session
    paciente_id: str
    interacao_id: str
    caso_id: str | None = None

    def evento(
        self,
        etapa: str,
        ator: str,
        entrada: dict | None = None,
        saida: dict | None = None,
        chamada: MetricasChamada | None = None,
    ) -> banco.Evento:
        return registrar_evento(
            self.sessao,
            etapa=etapa,
            ator=ator,
            paciente_id=self.paciente_id,
            caso_id=self.caso_id,
            interacao_id=self.interacao_id,
            entrada=entrada,
            saida=saida,
            chamada=chamada,
        )

    def vincular_caso(self, caso_id: str) -> None:
        """Liga ao caso os eventos já registrados nesta interação (C08)."""
        self.caso_id = caso_id
        anteriores = self.sessao.exec(
            select(banco.Evento).where(
                banco.Evento.interacao_id == self.interacao_id,
                col(banco.Evento.caso_id).is_(None),
            )
        ).all()
        for evento in anteriores:
            evento.caso_id = caso_id
            self.sessao.add(evento)
        self.sessao.commit()


def nova_interacao(sessao: Session, paciente_id: str, caso_id: str | None = None) -> Contexto:
    return Contexto(
        sessao=sessao, paciente_id=paciente_id,
        interacao_id=banco.novo_id("int"), caso_id=caso_id,
    )


def eventos_do_caso(sessao: Session, caso_id: str) -> list[banco.Evento]:
    return list(sessao.exec(
        select(banco.Evento).where(banco.Evento.caso_id == caso_id).order_by(col(banco.Evento.seq))
    ).all())


def eventos_recentes(
    sessao: Session,
    *,
    paciente_id: str | None = None,
    depois_de: str | None = None,
    limite: int = 200,
) -> list[banco.Evento]:
    """Eventos em ordem, opcionalmente só os posteriores ao evento `depois_de`."""
    consulta = select(banco.Evento)
    if paciente_id:
        consulta = consulta.where(banco.Evento.paciente_id == paciente_id)
    if depois_de:
        marco = sessao.exec(select(banco.Evento.seq).where(banco.Evento.id == depois_de)).first()
        if marco is not None:
            consulta = consulta.where(col(banco.Evento.seq) > marco)
        eventos = sessao.exec(consulta.order_by(col(banco.Evento.seq)).limit(limite)).all()
        return list(eventos)
    ultimos = sessao.exec(consulta.order_by(col(banco.Evento.seq).desc()).limit(limite)).all()
    return list(reversed(ultimos))


def para_contrato(evento: banco.Evento) -> contratos.Evento:
    return contratos.Evento.model_validate(evento.model_dump(exclude={"seq"}))
