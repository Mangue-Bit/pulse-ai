"""Aplicação FastAPI e rotas do Pulse."""

from datetime import datetime

from fastapi import FastAPI

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
        "agora": datetime.now().isoformat(timespec="seconds"),
    }
