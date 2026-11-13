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
from datetime import datetime

from sqlmodel import Session

from app import banco, rastro, relogio
from app.contratos import MensagemAprovada, SinalDeAlarme
from app.cuidado import aprovacao, desfecho, duvidas, entrada, ferramentas, orquestrador
from app.escuta import entrega
from app.escuta import fluxo as escuta
from app.escuta.fluxo import ResultadoEscuta
from app.regras import aceite as regra_do_aceite
from app.urgencia import trilha

Agendar = Callable[..., None]


# --- Sinal de alarme -> trilha de urgência (U01) --------------------------------

def _abrir_urgencia(ctx: rastro.Contexto, sinal: SinalDeAlarme) -> banco.Conversa:
    """Abre a trilha de urgência e suspende a fila automática do paciente."""
    _alerta, mensagem = trilha.abrir(ctx, SinalDeAlarme.model_validate(sinal.model_dump()))
    orquestrador.suspender_fila(ctx.sessao, sinal.paciente_id, "paciente em urgência", ctx)
    return mensagem


# --- Relato estruturado: Escuta (E12) -> Cuidado (C04) --------------------------

def receber_mensagem_do_paciente(
    s: Session, paciente_id: str, texto: str, canal: str, agendar: Agendar,
) -> ResultadoEscuta:
    """Passa a mensagem pela Escuta e leva o que saiu dela ao outro lado da fronteira.

    `agendar` recebe o trabalho do Cuidado para rodar depois da resposta ao
    paciente: a conversa não espera o orquestrador.
    """
    resultado = escuta.processar_mensagem(s, paciente_id, texto, canal)
    if resultado.sinal is not None:
        resultado.mensagens.append(_abrir_urgencia(resultado.contexto, resultado.sinal))
    if resultado.relato is not None:
        agendar(
            entregar_relato_ao_cuidado,
            resultado.relato.model_dump(mode="json"),
            resultado.contexto.interacao_id,
        )
    return resultado


def entregar_relato_ao_cuidado(relato: dict, interacao_id: str) -> None:
    """E12 -> C04. O relato atravessa serializado e é validado de novo na chegada."""
    with banco.sessao() as s:
        ctx = rastro.Contexto(sessao=s, paciente_id=str(relato.get("paciente_id", "")), interacao_id=interacao_id)
        _seguir(ctx, entrada.receber_relato(ctx, relato))


def _seguir(ctx: rastro.Contexto, resultado: entrada.ResultadoDaEntrada) -> entrada.ResultadoDaEntrada:
    """Se o Cuidado achou sinal de alarme (C05), ele atravessa para a trilha de urgência."""
    if resultado.sinal is not None:
        _abrir_urgencia(ctx, resultado.sinal)
    return resultado


# --- Outras entradas do Cuidado (C01 a C03) --------------------------------------

def receber_registro_do_acs(s: Session, paciente_id: str, acs_id: str, tipo: str, texto: str) -> tuple[str, str | None]:
    """C02: registro do agente comunitário de saúde. Devolve a interação e o caso."""
    ctx = rastro.nova_interacao(s, paciente_id)
    ctx.evento("C02", "pessoa", entrada={"acs_id": acs_id, "tipo": tipo, "texto": texto}, saida={
        "resumo": f"Registro de {tipo} feito pelo ACS. Segue para o filtro de entrada.",
    })
    resultado = _seguir(ctx, entrada.receber(ctx, "registro_acs", {
        "texto": texto, "acs_id": acs_id, "tipo": tipo, "registro_id": ctx.interacao_id,
    }))
    return ctx.interacao_id, resultado.caso_id


def sinalizar_risco_de_abandono(s: Session, paciente_id: str) -> tuple[str, str | None]:
    """C01: paciente sinalizado pela nota de risco de abandono."""
    paciente = s.get(banco.Paciente, paciente_id)
    ctx = rastro.nova_interacao(s, paciente_id)
    ctx.evento("C01", "regra", entrada={"risco_abandono": paciente.risco_abandono}, saida={
        "simulado": True,
        "resumo": f"Paciente sinalizado com alto risco de abandono (nota {paciente.risco_abandono:.2f}). "
                  "Na demonstração, a nota é sintética.",
    })
    resultado = _seguir(ctx, entrada.receber(ctx, "risco", {"risco_abandono": paciente.risco_abandono}))
    return ctx.interacao_id, resultado.caso_id


# --- Mensagem aprovada: Cuidado (C28) -> paciente (E13) --------------------------

def entregar_mensagem_aprovada(ctx: rastro.Contexto, mensagem: dict) -> bool:
    """C28 -> E13. A mensagem atravessa serializada e é validada de novo na chegada."""
    return entrega.entregar(ctx, MensagemAprovada.model_validate(mensagem))


ferramentas.definir_entrega(entregar_mensagem_aprovada)


def responder_duvida(s: Session, duvida_id: str, profissional: str, resposta: str) -> banco.Duvida:
    """C07: a resposta é do profissional. Ela chega ao paciente pela mesma porta das mensagens aprovadas."""
    duvida = s.get(banco.Duvida, duvida_id)
    if duvida is None:
        raise LookupError("Dúvida não encontrada.")
    if duvida.status == "respondida":
        raise ValueError("A dúvida já foi respondida.")
    mensagem = duvidas.responder(s, duvida, profissional, resposta)
    ctx = rastro.Contexto(sessao=s, paciente_id=duvida.paciente_id,
                          interacao_id=duvida.interacao_id or banco.novo_id("int"))
    entregar_mensagem_aprovada(ctx, mensagem.model_dump(mode="json"))
    return duvida


# --- Trilha de urgência: decisões da equipe --------------------------------------

def encerrar_alerta(s: Session, alerta_id: str, profissional: str, falso_positivo: bool) -> banco.Alerta:
    alerta = trilha.encerrar(s, alerta_id, profissional, falso_positivo)
    paciente = s.get(banco.Paciente, alerta.paciente_id)
    if paciente is not None and paciente.situacao == "ativo":
        orquestrador.retomar_fila(s, paciente.id)
    return alerta


# --- Aceite ----------------------------------------------------------------------

def registrar_aceite(s: Session, paciente_id: str) -> None:
    regra_do_aceite.registrar_aceite(s, paciente_id)
    rastro.registrar_evento(
        s, etapa="E04", ator="pessoa", paciente_id=paciente_id,
        saida={"aceite": "registrado", "resumo": "O paciente registrou o aceite."},
    )
    paciente = s.get(banco.Paciente, paciente_id)
    if paciente is not None and paciente.situacao == "ativo":
        orquestrador.retomar_fila(s, paciente_id)


def revogar_aceite(s: Session, paciente_id: str) -> int:
    """Revoga o aceite, cancela as propostas pendentes e bloqueia novos envios."""
    if not regra_do_aceite.revogar_aceite(s, paciente_id):
        return 0
    ctx = rastro.nova_interacao(s, paciente_id)
    ctx.evento("E04", "pessoa", saida={
        "aceite": "revogado", "resumo": "O paciente revogou o aceite. Nenhuma mensagem sai a partir de agora.",
    })
    return orquestrador.suspender_fila(s, paciente_id, "aceite revogado", ctx)


# --- Checagens por tempo (C03, C07, C25, C34, U03) --------------------------------

def checagens_por_tempo(s: Session, agora: datetime) -> list[dict]:
    disparos: list[dict] = []
    for vencida in duvidas.vencer_prazos(s, agora):
        # Dúvida sem resposta no prazo: Cuidado (C07) -> trilha de urgência (U02)
        trilha.abrir_por_duvida_vencida(s, vencida)
        disparos.append({"tipo": "duvida_vencida", "descricao": "Dúvida clínica venceu o prazo e virou alerta."})
    disparos += trilha.checar_prazos(s, agora)
    disparos += aprovacao.checar_prazos(s, agora)
    for gatilho in desfecho.checar_prazos(s, agora):
        disparos.append({"tipo": gatilho["tipo"], "descricao": gatilho["descricao"]})
        if gatilho.get("nova_rodada"):
            ctx = rastro.nova_interacao(s, gatilho["paciente_id"])
            ctx.evento("C03", "regra", entrada={"caso_id": gatilho["caso_id"]}, saida={
                "motivo": "nova_rodada",
                "resumo": "Checagem por tempo: a barreira não foi resolvida e o caso pede nova rodada.",
            })
            _seguir(ctx, entrada.receber(ctx, "tempo", {"motivo": "nova_rodada", "caso_id": gatilho["caso_id"]}))
    return disparos


relogio.registrar_checagem(checagens_por_tempo)
