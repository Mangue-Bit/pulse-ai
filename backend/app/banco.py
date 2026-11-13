"""Tabelas e sessão do banco (seção 5 do guia). SQLite em um arquivo."""

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pydantic import NaiveDatetime
from pathlib import Path

from sqlalchemy import JSON, Column, event
from sqlalchemy.engine import Engine
from sqlmodel import Field, Session, SQLModel, create_engine

from app.config import configuracao


def novo_id(prefixo: str) -> str:
    return f"{prefixo}-{uuid.uuid4().hex[:10]}"


class Microarea(SQLModel, table=True):
    id: str = Field(primary_key=True)
    nome: str


class Acs(SQLModel, table=True):
    id: str = Field(primary_key=True)
    nome: str
    microarea_id: str = Field(index=True)


class Paciente(SQLModel, table=True):
    id: str = Field(primary_key=True)
    nome: str
    idade: int
    microarea_id: str = Field(index=True)
    acs_id: str
    condicoes: list = Field(default_factory=list, sa_column=Column(JSON))
    medicamentos: list = Field(default_factory=list, sa_column=Column(JSON))
    situacao: str = "ativo"              # SituacaoPaciente
    risco_abandono: float = 0.0          # nota sintética no lugar do modelo de risco (C01)
    alto_risco: bool = False


class Aceite(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    registrado_em: NaiveDatetime
    revogado_em: NaiveDatetime | None = None


class Conversa(SQLModel, table=True):
    seq: int | None = Field(default=None, primary_key=True)
    id: str = Field(index=True, unique=True)
    paciente_id: str = Field(index=True)
    sessao_id: str = Field(index=True)
    autor: str                           # paciente | pulse | equipe
    canal: str = "texto"
    texto: str
    tipo: str                            # mensagem | fixa | resposta | aprovada
    etapa: str | None = None
    criado_em: NaiveDatetime
    expira_em: NaiveDatetime


class Relato(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    tipo: str
    barreira: str | None = None
    lembrete: str | None = None
    trecho_literal: str
    certeza: float
    criado_em: NaiveDatetime
    interacao_id: str | None = None


class Caso(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    microarea_id: str = Field(index=True)
    status: str = "aberto"               # StatusCaso
    rodada: int = 1
    pendencias: list = Field(default_factory=list, sa_column=Column(JSON))
    validade: NaiveDatetime | None = None
    barreira: str | None = None
    desfecho: str | None = None          # resolvido | busca_ativa | sem_registro
    recebeu_intervencao: bool = False
    lembrete_resultado_em: NaiveDatetime | None = None
    aberto_em: NaiveDatetime
    atualizado_em: NaiveDatetime


class Proposta(SQLModel, table=True):
    id: str = Field(primary_key=True)
    caso_id: str = Field(index=True)
    relato_id: str | None = None
    especialista: str
    item_catalogo_id: str | None = None
    ferramenta: str
    argumentos: dict = Field(default_factory=dict, sa_column=Column(JSON))
    justificativa: str = ""
    fontes: list = Field(default_factory=list, sa_column=Column(JSON))
    risco: str = "alto"
    estado: str = Field(default="pendente", index=True)
    verificacao: dict | None = Field(default=None, sa_column=Column(JSON))
    validade: NaiveDatetime
    tentativa: int = 1
    criado_em: NaiveDatetime
    decidida_por: str | None = None
    decidida_em: NaiveDatetime | None = None
    motivo: str | None = None
    lembrada_em: NaiveDatetime | None = None


class Execucao(SQLModel, table=True):
    id: str = Field(primary_key=True)
    proposta_id: str = Field(index=True)
    ferramenta: str
    chave_unica: str = Field(unique=True, index=True)   # impede o envio duplicado
    status: str = "confirmada"           # confirmada | falhou
    tentativas: int = 1
    resultado: dict = Field(default_factory=dict, sa_column=Column(JSON))
    criado_em: NaiveDatetime


class TarefaAcs(SQLModel, table=True):
    __tablename__ = "tarefa_acs"
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    acs_id: str = Field(index=True)
    caso_id: str | None = None
    proposta_id: str | None = None
    tipo: str
    descricao: str
    prazo: NaiveDatetime | None = None
    status: str = "aberta"               # aberta | concluida
    origem: str = "ferramenta"           # ferramenta | manual | urgencia
    criado_em: NaiveDatetime


class Relatorio(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    caso_id: str | None = None
    proposta_id: str | None = None
    frases: list = Field(default_factory=list, sa_column=Column(JSON))
    criado_em: NaiveDatetime


class Alerta(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    origem: str                          # escuta | cuidado | duvida_vencida
    regra: str
    trecho_literal: str
    duvida_id: str | None = None
    nivel: str = "plantao"               # plantao | enfermeiro | gestor
    status: str = Field(default="aberto", index=True)  # aberto | confirmado | pendencia_critica | encerrado
    prazo: NaiveDatetime
    niveis_avisados: list = Field(default_factory=list, sa_column=Column(JSON))
    confirmado_por: str | None = None
    confirmado_em: NaiveDatetime | None = None
    interacao_id: str | None = None
    criado_em: NaiveDatetime


class Duvida(SQLModel, table=True):
    id: str = Field(primary_key=True)
    paciente_id: str = Field(index=True)
    relato_id: str
    texto: str
    prazo: NaiveDatetime
    status: str = Field(default="aberta", index=True)  # aberta | respondida | vencida
    resposta: str | None = None
    respondida_por: str | None = None
    respondida_em: NaiveDatetime | None = None
    vencida_em: NaiveDatetime | None = None
    interacao_id: str | None = None
    criado_em: NaiveDatetime


class Resultado(SQLModel, table=True):
    id: str = Field(primary_key=True)
    caso_id: str = Field(index=True)
    proposta_id: str | None = None
    item_catalogo_id: str | None = None
    barreira_resolvida: bool
    observacao: str = ""
    registrado_por: str
    criado_em: NaiveDatetime


class Evento(SQLModel, table=True):
    seq: int | None = Field(default=None, primary_key=True)
    id: str = Field(index=True, unique=True)
    caso_id: str | None = Field(default=None, index=True)
    paciente_id: str = Field(index=True)
    interacao_id: str | None = Field(default=None, index=True)
    etapa: str
    ator: str
    entrada: dict = Field(default_factory=dict, sa_column=Column(JSON))
    saida: dict = Field(default_factory=dict, sa_column=Column(JSON))
    modelo: str | None = None
    versao_prompt: str | None = None
    latencia_ms: int | None = None
    tokens_entrada: int | None = None
    tokens_saida: int | None = None
    custo: float | None = None
    criado_em: NaiveDatetime


class ListaTerritorio(SQLModel, table=True):
    __tablename__ = "lista_territorio"
    microarea_id: str = Field(primary_key=True)
    itens: list = Field(default_factory=list, sa_column=Column(JSON))
    atualizado_em: NaiveDatetime


class Relogio(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    deslocamento_segundos: int = 0


_motor: Engine | None = None
_caminho: Path | None = None


def motor() -> Engine:
    """Motor do banco configurado em PULSE_BANCO. Recriado se o caminho mudar."""
    global _motor, _caminho
    caminho = configuracao().banco
    if _motor is None or caminho != _caminho:
        if _motor is not None:
            _motor.dispose()
        caminho.parent.mkdir(parents=True, exist_ok=True)
        _motor = create_engine(
            f"sqlite:///{caminho.as_posix()}",
            connect_args={"check_same_thread": False, "timeout": 15},
        )
        _caminho = caminho

        @event.listens_for(_motor, "connect")
        def _ao_conectar(conexao, _registro):
            cursor = conexao.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.close()

        SQLModel.metadata.create_all(_motor)
    return _motor


def criar_tabelas() -> None:
    SQLModel.metadata.create_all(motor())


def apagar_tudo() -> None:
    SQLModel.metadata.drop_all(motor())
    SQLModel.metadata.create_all(motor())


@contextmanager
def sessao() -> Iterator[Session]:
    with Session(motor(), expire_on_commit=False) as s:
        yield s


def sessao_da_rota() -> Iterator[Session]:
    """Dependência do FastAPI: uma sessão por requisição."""
    with sessao() as s:
        yield s
