"""Aplicação FastAPI e rotas do Pulse."""

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from sqlmodel import Session

from app import contratos, rastro, relogio
from app.banco import sessao_da_rota
from app.config import configuracao

app = FastAPI(title="Pulse", version="0.1.0")


@app.get("/api/saude")
def saude() -> dict:
    cfg = configuracao()
    return {
        "status": "ok",
        "modelo": cfg.modelo,
        "modelo_verificador": cfg.modelo_verificador,
        "modelo_simulado": cfg.modelo_simulado,
        "agora": relogio.agora().isoformat(),
    }


# --- Relógio do sistema -------------------------------------------------------

class AvancoDoRelogio(BaseModel):
    minutos: int = Field(gt=0, le=60 * 24 * 30)


def _estado_do_relogio() -> dict:
    return {
        "agora": relogio.agora().isoformat(),
        "deslocamento_minutos": relogio.deslocamento_minutos(),
    }


@app.get("/api/relogio")
def ler_relogio() -> dict:
    return _estado_do_relogio()


@app.post("/api/relogio/avancar")
def avancar_relogio(avanco: AvancoDoRelogio, s: Session = Depends(sessao_da_rota)) -> dict:
    disparos = relogio.avancar(s, avanco.minutos)
    return {**_estado_do_relogio(), "disparos": disparos}


# --- Rastro -------------------------------------------------------------------

@app.get("/api/casos/{caso_id}/eventos")
def eventos_do_caso(caso_id: str, s: Session = Depends(sessao_da_rota)) -> list[contratos.Evento]:
    return [rastro.para_contrato(e) for e in rastro.eventos_do_caso(s, caso_id)]


@app.get("/api/eventos")
def eventos(
    paciente_id: str | None = None,
    depois_de: str | None = None,
    limite: int = 200,
    s: Session = Depends(sessao_da_rota),
) -> list[contratos.Evento]:
    encontrados = rastro.eventos_recentes(
        s, paciente_id=paciente_id, depois_de=depois_de, limite=min(max(limite, 1), 500),
    )
    return [rastro.para_contrato(e) for e in encontrados]
