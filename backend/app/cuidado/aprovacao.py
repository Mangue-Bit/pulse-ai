"""Fila de aprovação pela equipe de saúde (C20 a C27).

O risco vem do catálogo. A decisão é humana: aprovar, editar ou recusar. Antes
de executar, o código relê o estado do caso, o aceite e a validade.
"""

from datetime import datetime

from sqlmodel import Session, col, select

from app import banco, rastro, relogio
from app.cuidado import ferramentas
from app.regras.aceite import aceite_valido
from app.regras.catalogo import item_por_id
from app.regras.limites import LEMBRETE_DA_PROPOSTA


class DecisaoInvalida(Exception):
    """A proposta não está mais pendente, ou a edição não se aplica a ela."""


# --- C20 a C22: entrada na fila ------------------------------------------------

def enfileirar(ctx: rastro.Contexto, caso: banco.Caso, proposta: banco.Proposta) -> None:
    # C20: qual o risco do item? Vem do catálogo, por regra.
    item = item_por_id(proposta.item_catalogo_id)
    risco = item.risco if item else proposta.risco
    proposta.risco = risco
    ctx.evento("C20", "regra", entrada={"proposta_id": proposta.id}, saida={
        "risco": risco, "origem": "catálogo" if item else "tipo da proposta",
        "resumo": f"Risco {risco}, definido pelo catálogo." if item else f"Risco {risco}, definido pelo tipo da proposta.",
    })
    if risco == "alto":
        ctx.evento("C22", "regra", saida={
            "proposta_id": proposta.id,
            "resumo": "Alto risco: aprovação individual, com o trecho literal e as fontes à vista.",
        })
    else:
        ctx.evento("C21", "regra", saida={
            "proposta_id": proposta.id,
            "resumo": "Baixo risco. Neste protótipo, também passa pela aprovação individual.",
        })
    caso.status = "aguardando_aprovacao"
    caso.validade = proposta.validade
    caso.atualizado_em = relogio.agora()
    ctx.sessao.add(proposta)
    ctx.sessao.add(caso)
    ctx.sessao.commit()


# --- C23 e C24: decisão da equipe ----------------------------------------------

def _pendente(s: Session, proposta_id: str) -> tuple[banco.Proposta, banco.Caso, rastro.Contexto]:
    proposta = s.get(banco.Proposta, proposta_id)
    if proposta is None:
        raise LookupError("Proposta não encontrada.")
    if proposta.estado != "pendente":
        raise DecisaoInvalida(f"A proposta já está {proposta.estado} e não pode mais ser decidida.")
    caso = s.get(banco.Caso, proposta.caso_id)
    return proposta, caso, rastro.nova_interacao(s, caso.paciente_id, caso.id)


def _decidir(s: Session, proposta: banco.Proposta, estado: str, profissional: str, motivo: str | None = None) -> None:
    proposta.estado = estado
    proposta.decidida_por = profissional
    proposta.decidida_em = relogio.agora()
    proposta.motivo = motivo
    s.add(proposta)
    s.commit()


def aprovar(s: Session, proposta_id: str, profissional: str) -> banco.Proposta:
    proposta, caso, ctx = _pendente(s, proposta_id)
    _decidir(s, proposta, "aprovada", profissional)
    ctx.evento("C23", "pessoa", entrada={"proposta_id": proposta.id}, saida={
        "decisao": "aprova", "profissional": profissional,
        "resumo": "A equipe de saúde aprovou a proposta sem edição.",
    })
    _executar_se_ainda_vale(ctx, caso, proposta, profissional)
    return proposta


def editar(s: Session, proposta_id: str, profissional: str, *, texto: str | None = None,
           canal: str | None = None, descricao: str | None = None) -> banco.Proposta:
    proposta, caso, ctx = _pendente(s, proposta_id)
    argumentos = dict(proposta.argumentos)
    campos = []
    if proposta.ferramenta == "enviar_mensagem":
        if texto and texto.strip() != argumentos.get("texto"):
            argumentos["texto_original"] = argumentos.get("texto")
            argumentos["texto"] = texto.strip()
            campos.append("texto")
        if canal in ("texto", "audio") and canal != argumentos.get("canal"):
            argumentos["canal"] = canal
            campos.append("canal")
    elif proposta.ferramenta == "criar_tarefa_acs":
        if descricao and descricao.strip() != argumentos.get("descricao"):
            argumentos["descricao_original"] = argumentos.get("descricao")
            argumentos["descricao"] = descricao.strip()
            campos.append("descricao")
    if not campos:
        raise DecisaoInvalida("A edição não mudou nada que possa ser editado nesta proposta.")
    proposta.argumentos = argumentos
    _decidir(s, proposta, "editada", profissional)
    ctx.evento("C23", "pessoa", entrada={"proposta_id": proposta.id}, saida={
        "decisao": "edita", "profissional": profissional, "campos_editados": campos,
        "resumo": f"A equipe de saúde editou a proposta ({', '.join(campos)}) e aprovou.",
    })
    _executar_se_ainda_vale(ctx, caso, proposta, profissional)
    return proposta


def recusar(s: Session, proposta_id: str, profissional: str, justificativa: str) -> banco.Proposta:
    proposta, caso, ctx = _pendente(s, proposta_id)
    _decidir(s, proposta, "recusada", profissional, justificativa.strip())
    ctx.evento("C23", "pessoa", entrada={"proposta_id": proposta.id}, saida={
        "decisao": "recusa", "profissional": profissional,
        "resumo": "A equipe de saúde recusou a proposta.",
    })
    # C24: encerrado, com a justificativa registrada
    ctx.evento("C24", "regra", saida={
        "justificativa": justificativa.strip(),
        "resumo": "Proposta encerrada. A justificativa fica registrada e alimenta o ciclo de aprendizado.",
    })
    _devolver_caso(s, caso, f"proposta recusada: {justificativa.strip()[:120]}")
    return proposta


def _devolver_caso(s: Session, caso: banco.Caso, pendencia: str) -> None:
    """Sem proposta em curso, o caso volta a ficar aberto, com a pendência anotada."""
    if caso.status == "aguardando_aprovacao":
        caso.status = "aberto"
    caso.validade = None
    caso.pendencias = [*caso.pendencias, pendencia]
    caso.atualizado_em = relogio.agora()
    s.add(caso)
    s.commit()


# --- C26 e C27: ainda vale executar? -------------------------------------------

def motivo_para_nao_executar(s: Session, proposta: banco.Proposta, caso: banco.Caso) -> str | None:
    """Relê o estado do caso, o aceite e a validade. Devolve o motivo do cancelamento, se houver."""
    paciente = s.get(banco.Paciente, caso.paciente_id)
    if paciente.situacao != "ativo":
        return f"paciente {paciente.situacao.replace('_', ' ')}"
    item = item_por_id(proposta.item_catalogo_id)
    exige_aceite = proposta.ferramenta == "enviar_mensagem" or (item is not None and item.exige_aceite)
    if exige_aceite and not aceite_valido(s, paciente.id):
        return "aceite revogado ou ausente"
    if proposta.validade < relogio.agora():
        return "proposta vencida"
    return None


def _executar_se_ainda_vale(ctx: rastro.Contexto, caso: banco.Caso, proposta: banco.Proposta, profissional: str) -> None:
    s = ctx.sessao
    motivo = motivo_para_nao_executar(s, proposta, caso)
    if motivo is not None:
        ctx.evento("C26", "regra", saida={"decisao": "não", "motivo": motivo, "resumo": f"Não vale mais executar: {motivo}."})
        # C27: cancela e registra
        proposta.estado = "cancelada"
        proposta.motivo = f"Cancelada antes da execução: {motivo}."
        s.add(proposta)
        s.commit()
        ctx.evento("C27", "regra", saida={
            "proposta_id": proposta.id, "motivo": motivo,
            "resumo": f"Proposta cancelada e registrada: {motivo}.",
        })
        _devolver_caso(s, caso, f"proposta cancelada: {motivo}")
        return
    ctx.evento("C26", "regra", saida={
        "decisao": "sim", "resumo": "Estado do caso, aceite e validade conferidos de novo: ainda vale executar.",
    })
    ferramentas.executar(ctx, caso, proposta, profissional)


def cancelar_pendentes(s: Session, paciente_id: str, motivo: str) -> int:
    """Cancela as propostas pendentes do paciente (C11, C27 e revogação do aceite)."""
    casos = [c.id for c in s.exec(select(banco.Caso).where(banco.Caso.paciente_id == paciente_id)).all()]
    if not casos:
        return 0
    pendentes = s.exec(select(banco.Proposta).where(
        col(banco.Proposta.caso_id).in_(casos), banco.Proposta.estado == "pendente",
    )).all()
    for proposta in pendentes:
        proposta.estado = "cancelada"
        proposta.motivo = f"Cancelada: {motivo}."
        s.add(proposta)
    s.commit()
    return len(pendentes)


# --- C25: sem resposta ---------------------------------------------------------

def checar_prazos(s: Session, agora: datetime) -> list[dict]:
    """Lembra o responsável das propostas paradas e expira as que passaram da validade."""
    disparos = []
    pendentes = s.exec(select(banco.Proposta).where(banco.Proposta.estado == "pendente")).all()
    for proposta in pendentes:
        caso = s.get(banco.Caso, proposta.caso_id)
        ctx = rastro.nova_interacao(s, caso.paciente_id, caso.id)
        if proposta.validade < agora:
            proposta.estado = "expirada"
            proposta.motivo = "Expirou sem resposta da equipe dentro da validade."
            s.add(proposta)
            s.commit()
            ctx.evento("C25", "regra", entrada={"proposta_id": proposta.id}, saida={
                "expirada": True, "resumo": "Proposta sem resposta até o fim da validade: expirou.",
            })
            _devolver_caso(s, caso, "proposta expirada sem resposta da equipe")
            disparos.append({"tipo": "proposta_expirada", "descricao": f"Proposta {proposta.id} expirou sem resposta."})
        elif proposta.lembrada_em is None and agora - proposta.criado_em >= LEMBRETE_DA_PROPOSTA:
            proposta.lembrada_em = agora
            s.add(proposta)
            s.commit()
            ctx.evento("C25", "regra", entrada={"proposta_id": proposta.id}, saida={
                "lembrete": True, "resumo": "Proposta parada na fila: o responsável foi lembrado.",
            })
            disparos.append({"tipo": "lembrete_de_aprovacao", "descricao": f"Lembrete da proposta {proposta.id} parada na fila."})
    return disparos


# --- Visão para a tela ---------------------------------------------------------

def _resumo_da_acao(s: Session, proposta: banco.Proposta) -> str:
    argumentos = proposta.argumentos or {}
    if proposta.ferramenta == "enviar_mensagem":
        return f"Enviar mensagem em {'áudio' if argumentos.get('canal') == 'audio' else 'texto'} ao paciente"
    if proposta.ferramenta == "criar_tarefa_acs":
        acs = s.get(banco.Acs, argumentos.get("acs_id", ""))
        return f"Criar tarefa de {argumentos.get('tipo', 'visita')} para {acs.nome if acs else 'o ACS'}"
    if proposta.ferramenta == "salvar_relatorio":
        return f"Salvar relatório do paciente com {len(argumentos.get('frases', []))} frase(s)"
    if proposta.ferramenta == "atualizar_lista":
        return f"Atualizar a lista priorizada da microárea com {len(argumentos.get('itens', []))} paciente(s)"
    return proposta.ferramenta


def para_visao(s: Session, proposta: banco.Proposta) -> dict:
    caso = s.get(banco.Caso, proposta.caso_id)
    paciente = s.get(banco.Paciente, caso.paciente_id) if caso else None
    relato = s.get(banco.Relato, proposta.relato_id) if proposta.relato_id else None
    item = item_por_id(proposta.item_catalogo_id)
    argumentos = proposta.argumentos or {}
    canal = argumentos.get("canal") if proposta.ferramenta == "enviar_mensagem" else (
        "presencial" if proposta.ferramenta == "criar_tarefa_acs" else None)
    return {
        **proposta.model_dump(exclude={"relato_id", "tentativa", "lembrada_em"}),
        "paciente_id": paciente.id if paciente else "",
        "paciente_nome": paciente.nome if paciente else "",
        "barreira": caso.barreira if caso else None,
        "trecho_literal": relato.trecho_literal if relato else None,
        "item_nome": item.nome if item else None,
        "resumo": _resumo_da_acao(s, proposta),
        "texto_mensagem": argumentos.get("texto") if proposta.ferramenta == "enviar_mensagem"
        else argumentos.get("descricao"),
        "canal": canal,
    }


def listar(s: Session, estado: str | None = None) -> list[banco.Proposta]:
    consulta = select(banco.Proposta)
    if estado:
        consulta = consulta.where(banco.Proposta.estado == estado)
    return list(s.exec(consulta.order_by(col(banco.Proposta.criado_em).desc())).all())
