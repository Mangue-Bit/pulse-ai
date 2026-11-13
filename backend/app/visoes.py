"""Visões de leitura para a interface da equipe.

Cada função monta, a partir do banco, o formato que uma tela consome. Nada aqui
decide ou altera estado: as decisões ficam nos módulos de domínio.
"""

from collections import defaultdict

from sqlmodel import Session, col, select

from app import banco
from app.cuidado import aprovacao

CASOS_EM_ABERTO = ("aberto", "aguardando_aprovacao", "aguardando_resultado", "busca_ativa")


def _nomes_dos_pacientes(s: Session) -> dict[str, str]:
    return {p.id: p.nome for p in s.exec(select(banco.Paciente)).all()}


# --- Casos -----------------------------------------------------------------------

def caso(s: Session, registro: banco.Caso, nomes: dict[str, str] | None = None) -> dict:
    paciente = s.get(banco.Paciente, registro.paciente_id)
    nome = (nomes or {}).get(registro.paciente_id) or (paciente.nome if paciente else "")
    return {
        "caso_id": registro.id,
        "paciente_id": registro.paciente_id,
        "paciente_nome": nome,
        "microarea_id": registro.microarea_id,
        "status": registro.status,
        "situacao_paciente": paciente.situacao if paciente else "ativo",
        "rodada": registro.rodada,
        "pendencias": list(registro.pendencias),
        "validade": registro.validade,
        "barreira": registro.barreira,
        "desfecho": registro.desfecho,
        "aberto_em": registro.aberto_em,
        "atualizado_em": registro.atualizado_em,
    }


def casos(s: Session) -> list[dict]:
    nomes = _nomes_dos_pacientes(s)
    registros = s.exec(select(banco.Caso).order_by(col(banco.Caso.atualizado_em).desc())).all()
    return [caso(s, r, nomes) for r in registros]


def tarefa(registro: banco.TarefaAcs, nomes: dict[str, str]) -> dict:
    return {
        **registro.model_dump(exclude={"proposta_id"}),
        "paciente_nome": nomes.get(registro.paciente_id, ""),
    }


def detalhe_do_caso(s: Session, registro: banco.Caso) -> dict:
    nomes = _nomes_dos_pacientes(s)
    propostas = s.exec(
        select(banco.Proposta).where(banco.Proposta.caso_id == registro.id)
        .order_by(col(banco.Proposta.criado_em))
    ).all()
    ids_dos_relatos = {p.relato_id for p in propostas if p.relato_id}
    relatos = s.exec(
        select(banco.Relato).where(col(banco.Relato.id).in_(ids_dos_relatos)).order_by(col(banco.Relato.criado_em))
    ).all() if ids_dos_relatos else []
    tarefas = s.exec(
        select(banco.TarefaAcs).where(banco.TarefaAcs.caso_id == registro.id)
        .order_by(col(banco.TarefaAcs.criado_em))
    ).all()
    resultados = s.exec(
        select(banco.Resultado).where(banco.Resultado.caso_id == registro.id)
        .order_by(col(banco.Resultado.criado_em))
    ).all()
    return {
        **caso(s, registro, nomes),
        "relatos": [r.model_dump(exclude={"interacao_id"}) for r in relatos],
        "propostas": [aprovacao.para_visao(s, p) for p in propostas],
        "tarefas": [tarefa(t, nomes) for t in tarefas],
        "resultados": [r.model_dump(exclude={"item_catalogo_id"}) for r in resultados],
    }


# --- Território (visão do ACS) ------------------------------------------------------

def territorio(s: Session, microarea: banco.Microarea) -> dict:
    nomes = _nomes_dos_pacientes(s)
    pacientes = {p.id for p in s.exec(select(banco.Paciente).where(banco.Paciente.microarea_id == microarea.id)).all()}
    agentes = s.exec(select(banco.Acs).where(banco.Acs.microarea_id == microarea.id).order_by(banco.Acs.id)).all()
    lista = s.get(banco.ListaTerritorio, microarea.id)
    itens = [
        {**item, "paciente_nome": item.get("paciente_nome") or nomes.get(item.get("paciente_id", ""), "")}
        for item in (lista.itens if lista else [])
    ]
    tarefas = s.exec(
        select(banco.TarefaAcs).where(col(banco.TarefaAcs.paciente_id).in_(pacientes))
        .order_by(col(banco.TarefaAcs.criado_em).desc())
    ).all() if pacientes else []
    # E05: paciente sem aceite escreveu; a Escuta avisou o ACS da área.
    avisos = s.exec(
        select(banco.Evento).where(banco.Evento.etapa == "E05", col(banco.Evento.paciente_id).in_(pacientes))
        .order_by(col(banco.Evento.criado_em).desc())
    ).all() if pacientes else []
    aguardando = s.exec(
        select(banco.Caso).where(banco.Caso.microarea_id == microarea.id, banco.Caso.status == "aguardando_resultado")
        .order_by(col(banco.Caso.atualizado_em).desc())
    ).all()
    return {
        "microarea_id": microarea.id,
        "microarea_nome": microarea.nome,
        "acs": [{"id": a.id, "nome": a.nome} for a in agentes],
        "lista_atualizada_em": lista.atualizado_em if lista else None,
        "lista": sorted(itens, key=lambda i: i.get("posicao", 0)),
        "tarefas": [tarefa(t, nomes) for t in tarefas],
        "avisos": [
            {
                "paciente_id": e.paciente_id,
                "paciente_nome": nomes.get(e.paciente_id, ""),
                "texto": "Escreveu sem aceite válido. Procurar o paciente para pedir o aceite.",
                "criado_em": e.criado_em,
            }
            for e in avisos if e.saida.get("aviso_ao_acs")
        ],
        "casos_aguardando_resultado": [caso(s, c, nomes) for c in aguardando],
    }


# --- Relatórios ------------------------------------------------------------------

def relatorios(s: Session, paciente_id: str | None = None) -> list[dict]:
    nomes = _nomes_dos_pacientes(s)
    consulta = select(banco.Relatorio)
    if paciente_id:
        consulta = consulta.where(banco.Relatorio.paciente_id == paciente_id)
    return [
        {**r.model_dump(exclude={"proposta_id"}), "paciente_nome": nomes.get(r.paciente_id, "")}
        for r in s.exec(consulta.order_by(col(banco.Relatorio.criado_em).desc())).all()
    ]


# --- Gestor: números agregados por microárea, sem nomes de pacientes ------------------

_CONTADORES = ("pacientes", "alto_risco", "sem_aceite", "em_urgencia", "casos_abertos",
               "aguardando_aprovacao", "aguardando_resultado", "busca_ativa", "resolvidos")


def resumo_gestor(s: Session, aceite_valido) -> dict:
    microareas = s.exec(select(banco.Microarea).order_by(banco.Microarea.id)).all()
    numeros = {m.id: {"microarea_id": m.id, "microarea_nome": m.nome, **dict.fromkeys(_CONTADORES, 0)}
               for m in microareas}
    for p in s.exec(select(banco.Paciente)).all():
        n = numeros.get(p.microarea_id)
        if n is None:
            continue
        n["pacientes"] += 1
        n["alto_risco"] += int(p.alto_risco)
        n["sem_aceite"] += int(not aceite_valido(s, p.id))
        n["em_urgencia"] += int(p.situacao == "em_urgencia")
    for c in s.exec(select(banco.Caso)).all():
        n = numeros.get(c.microarea_id)
        if n is None:
            continue
        n["casos_abertos"] += int(c.status in CASOS_EM_ABERTO)
        n["aguardando_aprovacao"] += int(c.status == "aguardando_aprovacao")
        n["aguardando_resultado"] += int(c.status == "aguardando_resultado")
        n["busca_ativa"] += int(c.status == "busca_ativa")
        n["resolvidos"] += int(c.status == "resolvido")
    lista = list(numeros.values())
    return {"microareas": lista, "totais": {k: sum(n[k] for n in lista) for k in _CONTADORES}}


# --- Métricas (LLMOps) -----------------------------------------------------------

def _taxa(parte: int, todo: int) -> float | None:
    return round(parte / todo, 3) if todo else None


def metricas(s: Session) -> dict:
    eventos = s.exec(select(banco.Evento)).all()

    decisoes = defaultdict(int)
    for e in eventos:
        if e.etapa == "C23":
            decisoes[e.saida.get("decisao")] += 1
    aprovadas, editadas, recusadas = decisoes["aprova"], decisoes["edita"], decisoes["recusa"]

    verificacoes = [p.verificacao for p in s.exec(select(banco.Proposta)).all() if p.verificacao]
    reprovadas = sum(1 for v in verificacoes if not v.get("aprovada"))

    falsos_positivos = sum(1 for e in eventos if e.etapa == "U05" and e.saida.get("falso_positivo"))
    alertas = len(s.exec(select(banco.Alerta)).all())
    duvidas_vencidas = len(s.exec(select(banco.Duvida).where(banco.Duvida.vencida_em != None)).all())  # noqa: E711

    chamadas = [e for e in eventos if e.modelo]
    latencias = [e.latencia_ms for e in chamadas if e.latencia_ms is not None]
    custo_total = sum(e.custo or 0 for e in chamadas)
    casos_com_chamada = {e.caso_id for e in chamadas if e.caso_id}

    por_prompt: dict[tuple[str, str], dict] = {}
    for e in chamadas:
        if not e.versao_prompt:
            continue
        linha = por_prompt.setdefault((e.versao_prompt, e.modelo), {
            "versao_prompt": e.versao_prompt, "modelo": e.modelo, "chamadas": 0, "falhas": 0,
            "_latencias": [], "custo": 0.0,
        })
        linha["chamadas"] += 1
        linha["falhas"] += int(e.saida.get("chamada") == "falhou")
        if e.latencia_ms is not None:
            linha["_latencias"].append(e.latencia_ms)
        linha["custo"] += e.custo or 0

    def _fechar(linha: dict) -> dict:
        latencias_da_linha = linha.pop("_latencias")
        linha["latencia_media_ms"] = round(sum(latencias_da_linha) / len(latencias_da_linha)) if latencias_da_linha else 0
        linha["custo"] = round(linha["custo"], 6)
        return linha

    return {
        "aprovacao": {
            "taxa_sem_edicao": _taxa(aprovadas, aprovadas + editadas),
            "aprovadas": aprovadas, "editadas": editadas, "recusadas": recusadas,
        },
        "verificador": {
            "taxa_reprovacao": _taxa(reprovadas, len(verificacoes)),
            "verificadas": len(verificacoes), "reprovadas": reprovadas,
        },
        "urgencia": {"alertas": alertas, "falsos_positivos": falsos_positivos, "duvidas_vencidas": duvidas_vencidas},
        "operacao": {
            "casos": len(s.exec(select(banco.Caso)).all()),
            "chamadas": len(chamadas),
            "latencia_media_ms": round(sum(latencias) / len(latencias)) if latencias else None,
            "custo_total": round(custo_total, 6),
            "custo_medio_por_caso": round(custo_total / len(casos_com_chamada), 6) if casos_com_chamada else None,
        },
        "por_prompt": sorted((_fechar(linha) for linha in por_prompt.values()), key=lambda linha: linha["versao_prompt"]),
        "teste_fixo": None,
        "modelo_de_risco": {"versao": "nota sintética v1", "situacao": "validada", "simulado": True},
    }
