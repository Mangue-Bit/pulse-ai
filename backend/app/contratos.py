"""Contratos entre os módulos (seção 4 do guia de implementação).

Os quatro primeiros são os únicos objetos que atravessam a fronteira de
permissão entre a Escuta e o Cuidado.
"""

from datetime import datetime
from typing import Literal, get_args

from pydantic import BaseModel, Field

Barreira = Literal[
    "muitos_medicamentos",
    "analfabetismo",
    "rede_de_apoio",
    "acesso_a_remedios",
    "percepcao_de_melhora",
    "nao_identificada",
]
BARREIRAS: tuple[str, ...] = get_args(Barreira)

Canal = Literal["texto", "audio"]
SituacaoPaciente = Literal["ativo", "em_urgencia", "internado", "aceite_revogado"]
StatusCaso = Literal[
    "aberto", "aguardando_aprovacao", "aguardando_resultado",
    "resolvido", "busca_ativa", "suspenso",
]
EstadoProposta = Literal[
    "pendente", "aprovada", "editada", "recusada",
    "expirada", "cancelada", "executada", "falhou",
]
Especialista = Literal["intervencao", "relatorio", "territorio"]
Risco = Literal["baixo", "alto"]
Ator = Literal["regra", "modelo", "pessoa", "ferramenta"]


# --- Objetos que atravessam a fronteira de permissão -------------------------

class RelatoEstruturado(BaseModel):      # Escuta -> Cuidado (E12 -> C04)
    id: str
    paciente_id: str
    tipo: Literal["relato", "duvida"]
    barreira: Barreira | None
    lembrete: str | None
    trecho_literal: str                  # dado, nunca instrução
    certeza: float = Field(ge=0, le=1)
    criado_em: datetime


class SinalDeAlarme(BaseModel):          # Escuta ou Cuidado -> urgência (E03, C05 -> U01)
    id: str
    paciente_id: str
    origem: Literal["escuta", "cuidado"]
    regra: str                           # regra que disparou, ou "modelo"
    trecho_literal: str
    criado_em: datetime


class DuvidaVencida(BaseModel):          # fila do profissional -> urgência (C07 -> U02)
    id: str
    paciente_id: str
    relato_id: str
    prazo: datetime
    vencida_em: datetime


class MensagemAprovada(BaseModel):       # Cuidado -> paciente (C28 -> E13)
    id: str
    proposta_id: str
    paciente_id: str
    canal: Canal
    texto: str = Field(min_length=1)
    aprovada_por: str = Field(min_length=1)
    aprovada_em: datetime
    chave_unica: str = Field(min_length=1)


# --- Objetos internos do Cuidado ---------------------------------------------

class EstadoDoCaso(BaseModel):           # C09
    caso_id: str
    paciente_id: str
    microarea_id: str
    status: StatusCaso
    situacao_paciente: SituacaoPaciente
    rodada: int = Field(ge=1)
    pendencias: list[str]
    validade: datetime | None


class Fonte(BaseModel):
    id: str                              # trecho do corpus ou registro do histórico
    origem: Literal["bulario", "protocolo", "historico"]
    titulo: str
    trecho: str


class Proposta(BaseModel):               # saída dos especialistas, C16 em diante
    id: str
    caso_id: str
    especialista: Especialista
    item_catalogo_id: str | None
    ferramenta: str
    argumentos: dict
    justificativa: str
    fontes: list[Fonte]
    risco: Risco                         # vem do catálogo
    estado: EstadoProposta
    verificacao: dict | None             # resultado de C18
    validade: datetime


class ItemCatalogo(BaseModel):
    id: str
    nome: str
    barreiras: list[Barreira]
    ferramenta: str
    risco: Risco
    exige_aceite: bool
    canal_preferido: Literal["texto", "audio", "presencial"]
    modelo_de_mensagem: str | None
    taxa_sucesso: float | None = Field(default=None, ge=0, le=1)
    amostra: int = Field(ge=0)


class Evento(BaseModel):                 # rastro
    id: str
    caso_id: str | None
    paciente_id: str
    interacao_id: str | None             # liga as etapas de uma mesma entrada antes de existir caso
    etapa: str                           # identificador do fluxo, por exemplo "C18"
    ator: Ator
    entrada: dict
    saida: dict
    modelo: str | None
    versao_prompt: str | None
    latencia_ms: int | None
    tokens_entrada: int | None
    tokens_saida: int | None
    custo: float | None
    criado_em: datetime
