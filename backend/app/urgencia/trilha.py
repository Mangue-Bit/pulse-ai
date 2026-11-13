"""Trilha de urgência (U01 a U05).

Regras fixas e pessoas. Nenhum agente decide aqui, e nenhum modelo é chamado.
Quem entra fica com a situação "em urgência", e a fila automática do paciente
é suspensa.
"""

from datetime import datetime

from sqlmodel import Session, col, select

from app import banco, rastro, relogio
from app.contratos import DuvidaVencida, SinalDeAlarme
from app.equipe import CADEIA_DE_ALERTA
from app.escuta import conversa
from app.regras.limites import PRAZO_DA_TAREFA, PRAZO_DO_ALERTA, em_palavras, unidade_aberta

MENSAGEM_DE_EMERGENCIA = (
    "Pelo que você escreveu, isso pode ser uma emergência. Ligue agora para o 192 (SAMU) ou vá à "
    "UPA mais próxima. Não espere por resposta aqui. A equipe da unidade de saúde já foi avisada."
)
AVISO_FORA_DO_HORARIO = " A unidade de saúde está fechada neste horário: procure o 192 ou a UPA."
MENSAGEM_DE_REFORCO = (
    "A equipe ainda não conseguiu falar com você. Se continuar se sentindo mal, ligue 192 ou vá à "
    "UPA agora. Um agente de saúde vai fazer uma visita."
)
NOME_DO_NIVEL = {"plantao": "plantão", "enfermeiro": "enfermeiro", "gestor": "gestor"}


class AlertaInvalido(Exception):
    """O alerta não pode receber a ação pedida no estado em que está."""


def _contexto(s: Session, alerta: banco.Alerta) -> rastro.Contexto:
    return rastro.Contexto(
        sessao=s, paciente_id=alerta.paciente_id,
        interacao_id=alerta.interacao_id or banco.novo_id("int"),
    )


def _marcar_em_urgencia(s: Session, paciente_id: str) -> None:
    paciente = s.get(banco.Paciente, paciente_id)
    if paciente is not None and paciente.situacao in ("ativo", "aceite_revogado"):
        paciente.situacao = "em_urgencia"
        s.add(paciente)
        s.commit()


def _alertar(ctx: rastro.Contexto, alerta: banco.Alerta, nivel: str, agora: datetime) -> None:
    """U02: avisa um nível da cadeia, com prazo para confirmar."""
    alerta.nivel = nivel
    alerta.prazo = agora + PRAZO_DO_ALERTA[nivel]
    alerta.niveis_avisados = [*alerta.niveis_avisados, {"nivel": nivel, "avisado_em": agora.isoformat()}]
    ctx.sessao.add(alerta)
    ctx.sessao.commit()
    ctx.evento("U02", "regra", entrada={"alerta_id": alerta.id}, saida={
        "nivel": nivel, "prazo": alerta.prazo,
        "resumo": f"Alerta enviado ao {NOME_DO_NIVEL[nivel]}, com {em_palavras(PRAZO_DO_ALERTA[nivel])} para confirmar.",
    })


def abrir(ctx: rastro.Contexto, sinal: SinalDeAlarme) -> tuple[banco.Alerta, banco.Conversa]:
    """U01 e U02: mensagem fixa de emergência na hora e alerta ao primeiro nível da cadeia."""
    s = ctx.sessao
    agora = relogio.agora()
    aberta = unidade_aberta(agora)
    mensagem = conversa.gravar(
        s, paciente_id=sinal.paciente_id, sessao_id=conversa.sessao_atual(s, sinal.paciente_id),
        autor="pulse", tipo="fixa", etapa="U01",
        texto=MENSAGEM_DE_EMERGENCIA + ("" if aberta else AVISO_FORA_DO_HORARIO),
    )
    _marcar_em_urgencia(s, sinal.paciente_id)
    ctx.evento("U01", "regra", entrada={"origem": sinal.origem, "regra": sinal.regra}, saida={
        "unidade_aberta": aberta, "situacao_do_paciente": "em_urgencia",
        "resumo": "Mensagem fixa de emergência enviada na hora: ligue 192 ou vá à UPA. Nenhum agente decide aqui."
                  + ("" if aberta else " Fora do horário, a mensagem avisa que a unidade está fechada."),
    })
    alerta = banco.Alerta(
        id=banco.novo_id("alt"), paciente_id=sinal.paciente_id, origem=sinal.origem, regra=sinal.regra,
        trecho_literal=sinal.trecho_literal, prazo=agora, niveis_avisados=[],
        interacao_id=ctx.interacao_id, criado_em=agora,
    )
    _alertar(ctx, alerta, CADEIA_DE_ALERTA[0], agora)
    return alerta, mensagem


def abrir_por_duvida_vencida(s: Session, duvida: DuvidaVencida) -> banco.Alerta:
    """C07 -> U02: a dúvida clínica que venceu o prazo sem resposta entra direto no alerta."""
    registro = s.get(banco.Duvida, duvida.id)
    agora = relogio.agora()
    _marcar_em_urgencia(s, duvida.paciente_id)
    alerta = banco.Alerta(
        id=banco.novo_id("alt"), paciente_id=duvida.paciente_id, origem="duvida_vencida",
        regra="duvida_sem_resposta_no_prazo", trecho_literal=registro.texto if registro else "",
        duvida_id=duvida.id, prazo=agora, niveis_avisados=[],
        interacao_id=registro.interacao_id if registro else None, criado_em=agora,
    )
    _alertar(_contexto(s, alerta), alerta, CADEIA_DE_ALERTA[0], agora)
    return alerta


def _alerta(s: Session, alerta_id: str) -> banco.Alerta:
    alerta = s.get(banco.Alerta, alerta_id)
    if alerta is None:
        raise LookupError("Alerta não encontrado.")
    return alerta


def confirmar(s: Session, alerta_id: str, profissional: str) -> banco.Alerta:
    """U03 (sim) e U05: um profissional confirma e assume o caso."""
    alerta = _alerta(s, alerta_id)
    if alerta.status not in ("aberto", "pendencia_critica"):
        raise AlertaInvalido(f"O alerta já está {alerta.status.replace('_', ' ')}.")
    agora = relogio.agora()
    alerta.status = "confirmado"
    alerta.confirmado_por = profissional
    alerta.confirmado_em = agora
    s.add(alerta)
    s.commit()
    ctx = _contexto(s, alerta)
    ctx.evento("U03", "pessoa", entrada={"alerta_id": alerta.id}, saida={
        "decisao": "sim", "profissional": profissional, "nivel": alerta.nivel,
        "resumo": f"Alerta confirmado no nível {NOME_DO_NIVEL[alerta.nivel]}.",
    })
    ctx.evento("U05", "pessoa", saida={
        "profissional": profissional,
        "resumo": "O profissional assume o caso e faz o contato humano com o paciente. Tudo fica no histórico.",
    })
    return alerta


def encerrar(s: Session, alerta_id: str, profissional: str, falso_positivo: bool) -> banco.Alerta:
    """O profissional encerra o atendimento. Sem outro alerta em curso, o paciente volta a ficar ativo."""
    alerta = _alerta(s, alerta_id)
    if alerta.status != "confirmado":
        raise AlertaInvalido("Só um alerta confirmado por um profissional pode ser encerrado.")
    alerta.status = "encerrado"
    s.add(alerta)
    s.commit()
    outros = s.exec(select(banco.Alerta).where(
        banco.Alerta.paciente_id == alerta.paciente_id,
        col(banco.Alerta.status).in_(("aberto", "confirmado", "pendencia_critica")),
    )).first()
    paciente = s.get(banco.Paciente, alerta.paciente_id)
    if outros is None and paciente is not None and paciente.situacao == "em_urgencia":
        paciente.situacao = "ativo"
        s.add(paciente)
        s.commit()
    _contexto(s, alerta).evento("U05", "pessoa", entrada={"alerta_id": alerta.id}, saida={
        "encerrado": True, "falso_positivo": falso_positivo, "profissional": profissional,
        "resumo": "Atendimento encerrado pelo profissional"
                  + (", que marcou o alerta como falso positivo." if falso_positivo else "."),
    })
    return alerta


def checar_prazos(s: Session, agora: datetime) -> list[dict]:
    """U03 (não) e U04: sem confirmação no prazo, o alerta sobe um nível; no fim da cadeia, pendência crítica."""
    disparos = []
    abertos = s.exec(select(banco.Alerta).where(banco.Alerta.status == "aberto")).all()
    for alerta in abertos:
        ctx = _contexto(s, alerta)
        while alerta.status == "aberto" and alerta.prazo < agora:
            vencido_em = alerta.prazo
            ctx.evento("U03", "regra", entrada={"alerta_id": alerta.id}, saida={
                "decisao": "não", "nivel": alerta.nivel,
                "resumo": f"Ninguém confirmou no nível {NOME_DO_NIVEL[alerta.nivel]} dentro do prazo.",
            })
            posicao = CADEIA_DE_ALERTA.index(alerta.nivel)
            if posicao + 1 < len(CADEIA_DE_ALERTA):
                proximo = CADEIA_DE_ALERTA[posicao + 1]
                _alertar(ctx, alerta, proximo, vencido_em)
                disparos.append({"tipo": "alerta_escalonado",
                                 "descricao": f"Alerta sem confirmação: subiu para o {NOME_DO_NIVEL[proximo]}."})
            else:
                _pendencia_critica(ctx, alerta)
                disparos.append({"tipo": "pendencia_critica",
                                 "descricao": "Cadeia de alerta esgotada sem confirmação: pendência crítica."})
    return disparos


def _pendencia_critica(ctx: rastro.Contexto, alerta: banco.Alerta) -> None:
    """U04: reforça 192/UPA, põe o caso no topo do próximo turno e marca visita prioritária do ACS."""
    s = ctx.sessao
    agora = relogio.agora()
    alerta.status = "pendencia_critica"
    s.add(alerta)
    conversa.gravar(
        s, paciente_id=alerta.paciente_id, sessao_id=conversa.sessao_atual(s, alerta.paciente_id),
        autor="pulse", tipo="fixa", etapa="U04", texto=MENSAGEM_DE_REFORCO,
    )
    paciente = s.get(banco.Paciente, alerta.paciente_id)
    tarefa = banco.TarefaAcs(
        id=banco.novo_id("tar"), paciente_id=alerta.paciente_id, acs_id=paciente.acs_id,
        tipo="visita_prioritaria", origem="urgencia",
        descricao=f"Visita prioritária: alerta de urgência de {paciente.nome.split()[0]} ficou sem confirmação da equipe.",
        prazo=agora + PRAZO_DA_TAREFA, criado_em=agora,
    )
    s.add(tarefa)
    s.commit()
    ctx.evento("U04", "regra", entrada={"alerta_id": alerta.id}, saida={
        "tarefa_id": tarefa.id, "topo_da_fila_do_proximo_turno": True,
        "resumo": "Pendência crítica: reforço de 192/UPA ao paciente, caso no topo da fila do próximo turno "
                  "e visita prioritária do ACS.",
    })


def listar(s: Session) -> list[banco.Alerta]:
    return list(s.exec(select(banco.Alerta).order_by(col(banco.Alerta.criado_em).desc())).all())


def para_visao(s: Session, alerta: banco.Alerta) -> dict:
    paciente = s.get(banco.Paciente, alerta.paciente_id)
    return {
        **alerta.model_dump(exclude={"interacao_id", "duvida_id"}),
        "paciente_nome": paciente.nome if paciente else "",
    }
