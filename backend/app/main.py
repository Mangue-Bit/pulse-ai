"""Aplicação FastAPI e rotas do Pulse."""

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import banco, contratos, equipe, modelo, rastro, relogio
from app.banco import sessao_da_rota
from app.config import configuracao
from app.regras.aceite import aceite_valido

app = FastAPI(title="Pulse", version="0.1.0")


@app.get("/api/saude")
def saude() -> dict:
    cfg = configuracao()
    return {
        "status": "ok",
        "modelo": cfg.modelo,
        "modelo_verificador": cfg.modelo_verificador,
        "modelo_simulado": modelo.em_modo_simulado(),
        "agora": relogio.agora().isoformat(),
    }


# --- Pacientes e equipe -------------------------------------------------------

def _paciente_ou_404(s: Session, paciente_id: str) -> banco.Paciente:
    paciente = s.get(banco.Paciente, paciente_id)
    if paciente is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    return paciente


@app.get("/api/pacientes")
def pacientes(s: Session = Depends(sessao_da_rota)) -> list[dict]:
    microareas = {m.id: m.nome for m in s.exec(select(banco.Microarea)).all()}
    agentes = {a.id: a.nome for a in s.exec(select(banco.Acs)).all()}
    return [
        {
            **p.model_dump(),
            "microarea_nome": microareas.get(p.microarea_id, ""),
            "acs_nome": agentes.get(p.acs_id, ""),
            "aceite_valido": aceite_valido(s, p.id),
        }
        for p in s.exec(select(banco.Paciente).order_by(banco.Paciente.id)).all()
    ]


@app.get("/api/equipe")
def listar_equipe(s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return equipe.listar(s)


@app.post("/api/demo/reiniciar")
def reiniciar_demonstracao(s: Session = Depends(sessao_da_rota)) -> dict:
    """Recria os dados sintéticos e zera o relógio do sistema."""
    from dados import carga

    carga.carregar(s)
    return {"status": "ok"}


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
