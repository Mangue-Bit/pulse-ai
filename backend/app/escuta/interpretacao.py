"""Ponto de chamada 1: triagem e interpretação do relato (E03, E06, E08, E10).

Uma única chamada com saída estruturada responde às quatro etapas. O texto do
paciente entra em bloco de dado, nunca como instrução.
"""

import re
from typing import Literal

from pydantic import BaseModel, Field

from app import modelo
from app.contratos import Barreira

PONTO = "interpretar_relato"
TAREFA = (
    "Classifique a mensagem do paciente que está no bloco de dado abaixo, "
    "preenchendo todos os campos do esquema."
)
TAMANHO_DO_TRECHO = 280


class Triagem(BaseModel):
    urgencia: bool
    entendivel: bool
    duvida_clinica: bool
    tipo: Literal["relato", "duvida"]
    barreira: Barreira | None
    trecho_literal: str
    certeza: float = Field(ge=0, le=1)
    lembrete: str | None


def _espacos(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def trecho_conferido(trecho: str, texto: str) -> str:
    """Garante que o trecho é literal: se não estiver na mensagem, usa a própria mensagem."""
    trecho, texto = _espacos(trecho), _espacos(texto)
    if trecho and trecho.lower() in texto.lower():
        return trecho
    return texto[:TAMANHO_DO_TRECHO]


def triar(texto: str) -> tuple[Triagem | None, modelo.Resultado]:
    """Chama o modelo. Sem resposta válida, devolve None e o motivo da falha no resultado."""
    mensagem = modelo.montar_mensagem(TAREFA, {"mensagem_do_paciente": texto})
    resultado = modelo.chamar_estruturado(PONTO, mensagem, Triagem, esforco="low")
    if not resultado.ok:
        return None, resultado
    triagem: Triagem = resultado.saida
    triagem.trecho_literal = trecho_conferido(triagem.trecho_literal, texto)
    if triagem.duvida_clinica:
        triagem.tipo, triagem.barreira = "duvida", None
    else:
        triagem.tipo = "relato"
    return triagem, resultado
