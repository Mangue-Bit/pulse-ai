"""Configuração lida do ambiente. Segredos ficam só em .env, que não é versionado."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[2]
PASTA_BACKEND = RAIZ / "backend"
PASTA_DADOS = PASTA_BACKEND / "dados"

load_dotenv(RAIZ / ".env")


@dataclass(frozen=True)
class Configuracao:
    modelo: str
    modelo_verificador: str
    banco: Path
    modelo_simulado: bool


def configuracao() -> Configuracao:
    banco = Path(os.environ.get("PULSE_BANCO") or "backend/dados/pulse.db")
    if not banco.is_absolute():
        banco = RAIZ / banco
    tem_credencial = bool(os.environ.get("GROQ_API_KEY", "").strip())
    forcado = os.environ.get("PULSE_MODELO_SIMULADO", "").strip() in {"1", "true", "sim"}
    return Configuracao(
        modelo=os.environ.get("PULSE_MODELO") or "openai/gpt-oss-120b",
        modelo_verificador=os.environ.get("PULSE_MODELO_VERIFICADOR") or "openai/gpt-oss-120b",
        banco=banco,
        modelo_simulado=forcado or not tem_credencial,
    )
