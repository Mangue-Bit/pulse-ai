"""Aplicação FastAPI e rotas do Pulse."""

from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app import banco, contratos, equipe, fronteira, modelo, rastro, relogio, visoes
from app.banco import sessao_da_rota
from app.config import configuracao
from app.cuidado import aprovacao, duvidas
from app.cuidado.aprovacao import DecisaoInvalida
from app.cuidado.desfecho import ResultadoInvalido, registrar_resultado
from app.escuta import conversa
from app.regras.aceite import aceite_valido
from app.regras.limites import TAMANHO_MAXIMO_DA_MENSAGEM
from app.urgencia import trilha
from app.urgencia.trilha import AlertaInvalido

app = FastAPI(title="Pulse", version="0.1.0")


@app.exception_handler(LookupError)
def _nao_encontrado(_: Request, erro: LookupError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(erro)})


@app.exception_handler(DecisaoInvalida)
@app.exception_handler(AlertaInvalido)
@app.exception_handler(ResultadoInvalido)
def _conflito(_: Request, erro: Exception) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(erro)})


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


# --- Paciente: conversa e aceite (Escuta) --------------------------------------

class MensagemDoPaciente(BaseModel):
    paciente_id: str
    texto: str = Field(max_length=TAMANHO_MAXIMO_DA_MENSAGEM)
    canal: contratos.Canal = "texto"


class PedidoDeAceite(BaseModel):
    paciente_id: str


@app.post("/api/mensagens")
def receber_mensagem(
    mensagem: MensagemDoPaciente, tarefas: BackgroundTasks, s: Session = Depends(sessao_da_rota),
) -> dict:
    _paciente_ou_404(s, mensagem.paciente_id)
    resultado = fronteira.receber_mensagem_do_paciente(
        s, mensagem.paciente_id, mensagem.texto, mensagem.canal, tarefas.add_task,
    )
    return {
        "interacao_id": resultado.contexto.interacao_id,
        "desfecho": resultado.desfecho,
        "mensagens": [conversa.para_visao(m) for m in resultado.mensagens],
    }


@app.get("/api/conversas/{paciente_id}")
def ler_conversa(paciente_id: str, s: Session = Depends(sessao_da_rota)) -> dict:
    _paciente_ou_404(s, paciente_id)
    return {
        "paciente_id": paciente_id,
        "aceite_valido": aceite_valido(s, paciente_id),
        "mensagens": [conversa.para_visao(m) for m in conversa.listar(s, paciente_id)],
    }


@app.post("/api/aceite")
def registrar_aceite(pedido: PedidoDeAceite, s: Session = Depends(sessao_da_rota)) -> dict:
    _paciente_ou_404(s, pedido.paciente_id)
    fronteira.registrar_aceite(s, pedido.paciente_id)
    return {"paciente_id": pedido.paciente_id, "aceite_valido": True, "propostas_canceladas": 0}


@app.delete("/api/aceite/{paciente_id}")
def revogar_aceite(paciente_id: str, s: Session = Depends(sessao_da_rota)) -> dict:
    _paciente_ou_404(s, paciente_id)
    canceladas = fronteira.revogar_aceite(s, paciente_id)
    return {"paciente_id": paciente_id, "aceite_valido": False, "propostas_canceladas": canceladas}


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


# --- Trilha de urgência e fila do profissional ----------------------------------

class DecisaoDoProfissional(BaseModel):
    profissional: str = Field(min_length=1)


class EncerramentoDoAlerta(DecisaoDoProfissional):
    falso_positivo: bool = False


class RespostaADuvida(DecisaoDoProfissional):
    resposta: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DA_MENSAGEM)


@app.get("/api/alertas")
def listar_alertas(s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return [trilha.para_visao(s, a) for a in trilha.listar(s)]


@app.post("/api/alertas/{alerta_id}/confirmar")
def confirmar_alerta(alerta_id: str, decisao: DecisaoDoProfissional, s: Session = Depends(sessao_da_rota)) -> dict:
    return trilha.para_visao(s, trilha.confirmar(s, alerta_id, decisao.profissional))


@app.post("/api/alertas/{alerta_id}/encerrar")
def encerrar_alerta(alerta_id: str, decisao: EncerramentoDoAlerta, s: Session = Depends(sessao_da_rota)) -> dict:
    alerta = fronteira.encerrar_alerta(s, alerta_id, decisao.profissional, decisao.falso_positivo)
    return trilha.para_visao(s, alerta)


@app.get("/api/duvidas")
def listar_duvidas(s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return [duvidas.para_visao(s, d) for d in duvidas.listar(s)]


@app.post("/api/duvidas/{duvida_id}/responder")
def responder_duvida(duvida_id: str, pedido: RespostaADuvida, s: Session = Depends(sessao_da_rota)) -> dict:
    try:
        duvida = fronteira.responder_duvida(s, duvida_id, pedido.profissional, pedido.resposta.strip())
    except ValueError as erro:
        raise HTTPException(status_code=409, detail=str(erro)) from erro
    return duvidas.para_visao(s, duvida)


# --- Fila de aprovação -----------------------------------------------------------

class EdicaoDaProposta(DecisaoDoProfissional):
    texto: str | None = Field(default=None, max_length=TAMANHO_MAXIMO_DA_MENSAGEM)
    canal: contratos.Canal | None = None
    descricao: str | None = Field(default=None, max_length=TAMANHO_MAXIMO_DA_MENSAGEM)


class RecusaDaProposta(DecisaoDoProfissional):
    justificativa: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DA_MENSAGEM)


@app.get("/api/propostas")
def listar_propostas(estado: str | None = None, s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return [aprovacao.para_visao(s, p) for p in aprovacao.listar(s, estado)]


@app.post("/api/propostas/{proposta_id}/aprovar")
def aprovar_proposta(proposta_id: str, decisao: DecisaoDoProfissional, s: Session = Depends(sessao_da_rota)) -> dict:
    return aprovacao.para_visao(s, aprovacao.aprovar(s, proposta_id, decisao.profissional))


@app.post("/api/propostas/{proposta_id}/editar")
def editar_proposta(proposta_id: str, edicao: EdicaoDaProposta, s: Session = Depends(sessao_da_rota)) -> dict:
    proposta = aprovacao.editar(
        s, proposta_id, edicao.profissional, texto=edicao.texto, canal=edicao.canal, descricao=edicao.descricao,
    )
    return aprovacao.para_visao(s, proposta)


@app.post("/api/propostas/{proposta_id}/recusar")
def recusar_proposta(proposta_id: str, recusa: RecusaDaProposta, s: Session = Depends(sessao_da_rota)) -> dict:
    return aprovacao.para_visao(s, aprovacao.recusar(s, proposta_id, recusa.profissional, recusa.justificativa))


# --- Casos -----------------------------------------------------------------------

class RegistroDeResultado(BaseModel):
    acs_id: str = Field(min_length=1)
    barreira_resolvida: bool
    observacao: str = Field(default="", max_length=TAMANHO_MAXIMO_DA_MENSAGEM)


def _caso_ou_404(s: Session, caso_id: str) -> banco.Caso:
    caso = s.get(banco.Caso, caso_id)
    if caso is None:
        raise HTTPException(status_code=404, detail="Caso não encontrado.")
    return caso


@app.get("/api/casos")
def listar_casos(s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return visoes.casos(s)


@app.get("/api/casos/{caso_id}")
def detalhar_caso(caso_id: str, s: Session = Depends(sessao_da_rota)) -> dict:
    return visoes.detalhe_do_caso(s, _caso_ou_404(s, caso_id))


@app.post("/api/casos/{caso_id}/resultado")
def registrar_resultado_do_caso(
    caso_id: str, registro: RegistroDeResultado, s: Session = Depends(sessao_da_rota),
) -> dict:
    caso = registrar_resultado(s, caso_id, registro.acs_id, registro.barreira_resolvida, registro.observacao)
    return visoes.detalhe_do_caso(s, caso)


# --- ACS, território, relatórios e gestor ------------------------------------------

class RegistroDoAcs(BaseModel):
    paciente_id: str
    acs_id: str = Field(min_length=1)
    tipo: Literal["visita", "contato", "observacao"]
    texto: str = Field(min_length=1, max_length=TAMANHO_MAXIMO_DA_MENSAGEM)


@app.post("/api/acs/registros")
def registrar_do_acs(registro: RegistroDoAcs, s: Session = Depends(sessao_da_rota)) -> dict:
    _paciente_ou_404(s, registro.paciente_id)
    interacao_id, caso_id = fronteira.receber_registro_do_acs(
        s, registro.paciente_id, registro.acs_id, registro.tipo, registro.texto.strip(),
    )
    return {"interacao_id": interacao_id, "caso_id": caso_id}


@app.get("/api/territorio/{microarea_id}")
def ver_territorio(microarea_id: str, s: Session = Depends(sessao_da_rota)) -> dict:
    microarea = s.get(banco.Microarea, microarea_id)
    if microarea is None:
        raise HTTPException(status_code=404, detail="Microárea não encontrada.")
    return visoes.territorio(s, microarea)


@app.get("/api/relatorios")
def listar_relatorios(paciente_id: str | None = None, s: Session = Depends(sessao_da_rota)) -> list[dict]:
    return visoes.relatorios(s, paciente_id)


@app.get("/api/gestor/resumo")
def resumo_do_gestor(s: Session = Depends(sessao_da_rota)) -> dict:
    return visoes.resumo_gestor(s, aceite_valido)


# --- Observabilidade ---------------------------------------------------------------

@app.get("/api/metricas")
def ver_metricas(s: Session = Depends(sessao_da_rota)) -> dict:
    return visoes.metricas(s)
