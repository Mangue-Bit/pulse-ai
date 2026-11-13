"""Agente de Intervenção (I01 a I03).

As regras filtram o catálogo; o modelo só escolhe entre os itens permitidos,
chamando uma ferramenta. O `tool_use` devolvido vira Proposta e não é executado.
"""

from datetime import timedelta
from typing import TYPE_CHECKING

from sqlmodel import select

from app import banco, modelo, rastro, relogio
from app.contratos import Fonte, ItemCatalogo
from app.regras.aceite import aceite_valido
from app.regras.catalogo import Selecao, item_por_id, itens_permitidos, taxa_atual
from app.regras.limites import AMOSTRA_MINIMA, PRAZO_DA_TAREFA, VALIDADE_DA_PROPOSTA

if TYPE_CHECKING:
    from app.cuidado.entrada import Entrada

PONTO = "escolher_intervencao"
TAREFA = (
    "Escolha uma intervenção para o caso descrito nos blocos de dado abaixo, chamando uma das "
    "ferramentas disponíveis. Só valem os itens permitidos e as fontes listadas."
)
DESCRICAO_DA_FERRAMENTA = {
    "enviar_mensagem": "Propõe o envio ao paciente de uma mensagem com o modelo de texto do item do catálogo. "
                       "A mensagem só sai depois da aprovação da equipe de saúde.",
    "criar_tarefa_acs": "Propõe uma tarefa presencial para o agente comunitário de saúde, conforme o item do catálogo. "
                        "A tarefa só é criada depois da aprovação da equipe de saúde.",
}


def itens_ja_tentados(s, caso_id: str) -> set[str]:
    """Itens que já tiveram resultado registrado neste caso sem resolver a barreira."""
    resultados = s.exec(select(banco.Resultado).where(
        banco.Resultado.caso_id == caso_id, banco.Resultado.barreira_resolvida == False,  # noqa: E712
    )).all()
    return {r.item_catalogo_id for r in resultados if r.item_catalogo_id}


def declarar_ferramentas(permitidos: list[ItemCatalogo], fontes: list[Fonte]) -> list[dict]:
    """Uma ferramenta por tipo de ação presente nos itens permitidos, com enumerações fechadas."""
    ferramentas = []
    ids_das_fontes = [f.id for f in fontes]
    for nome in dict.fromkeys(item.ferramenta for item in permitidos):
        propriedades = {
            "item_catalogo_id": {
                "type": "string", "enum": [i.id for i in permitidos if i.ferramenta == nome],
                "description": "Item do catálogo escolhido, entre os permitidos.",
            },
            "justificativa": {
                "type": "string",
                "description": "Por que este item responde ao fator de risco, em uma ou duas frases para a equipe de saúde. "
                               "Sem dose, horário, troca ou interrupção de medicamento.",
            },
            "fontes": {
                "type": "array", "items": {"type": "string", "enum": ids_das_fontes},
                "description": "Identificadores dos trechos do contexto que sustentam a escolha. Ao menos um.",
            },
        }
        if nome == "enviar_mensagem":
            propriedades["canal"] = {
                "type": "string", "enum": ["texto", "audio"], "description": "Canal da mensagem.",
            }
        else:
            propriedades["tipo"] = {
                "type": "string", "enum": ["visita", "contato"], "description": "Tipo da tarefa do ACS.",
            }
        ferramentas.append({
            "name": nome,
            "description": DESCRICAO_DA_FERRAMENTA[nome],
            "input_schema": {
                "type": "object", "properties": propriedades,
                "required": list(propriedades), "additionalProperties": False,
            },
        })
    return ferramentas


def montar_argumentos(item: ItemCatalogo, paciente: banco.Paciente, acs: banco.Acs,
                      barreira: str | None, escolha: dict) -> dict:
    """Argumentos da ferramenta (seção 7 do guia). Destinatário, variáveis e prazo vêm das regras."""
    variaveis = {"nome": paciente.nome.split()[0], "acs": acs.nome.split()[0]}
    texto = item.modelo_de_mensagem.format(**variaveis)
    if item.ferramenta == "enviar_mensagem":
        canal = escolha.get("canal") if escolha.get("canal") in ("texto", "audio") else item.canal_preferido
        if barreira == "analfabetismo":
            canal = "audio"          # regra: analfabetismo prefere áudio
        if canal not in ("texto", "audio"):
            canal = "texto"
        return {
            "paciente_id": paciente.id, "modelo_de_mensagem": item.id, "variaveis": variaveis,
            "canal": canal, "texto": texto,
        }
    tipo = escolha.get("tipo") if escolha.get("tipo") in ("visita", "contato") else "visita"
    return {
        "paciente_id": paciente.id, "acs_id": acs.id, "tipo": tipo, "descricao": texto,
        "prazo": (relogio.agora() + PRAZO_DA_TAREFA).isoformat(),
    }


def _selecionar(ctx: rastro.Contexto, caso: banco.Caso, paciente: banco.Paciente) -> Selecao:
    # I01: lê o fator de risco
    ctx.evento("I01", "regra", saida={
        "fator_de_risco": caso.barreira,
        "resumo": f"Fator de risco do caso: {caso.barreira}.",
    })
    # I02: regras filtram o catálogo
    tem_aceite = aceite_valido(ctx.sessao, paciente.id)
    selecao = itens_permitidos(
        ctx.sessao, caso.barreira, tem_aceite=tem_aceite,
        ja_tentados=itens_ja_tentados(ctx.sessao, caso.id),
    )
    ctx.evento("I02", "regra", entrada={"aceite_valido": tem_aceite}, saida={
        "permitidos": [i.id for i in selecao.permitidos], "excluidos": selecao.excluidos,
        "resumo": f"{len(selecao.permitidos)} item(ns) permitido(s) pelas regras"
                  + ("" if tem_aceite else ", só ações presenciais porque não há aceite")
                  + (", com preferência por áudio" if caso.barreira == "analfabetismo" and tem_aceite else "") + ".",
    })
    return selecao


def propor(ctx: rastro.Contexto, caso: banco.Caso, paciente: banco.Paciente,
           entrada: "Entrada", fontes: list[Fonte], correcao: list[str] | None = None) -> banco.Proposta | None:
    """Devolve uma proposta pendente, ou None se nada puder ser proposto (C17).

    `correcao` traz os motivos da reprovação do verificador, na segunda tentativa (C19).
    """
    s = ctx.sessao
    selecao = _selecionar(ctx, caso, paciente)
    if not selecao.permitidos:
        return None

    itens = []
    for posicao, item in enumerate(selecao.permitidos, 1):
        taxa, amostra = taxa_atual(s, item)
        itens.append({
            "posicao": posicao, "id": item.id, "nome": item.nome, "ferramenta": item.ferramenta,
            "canal_preferido": item.canal_preferido,
            "taxa_de_sucesso": taxa if amostra >= AMOSTRA_MINIMA else None, "amostra": amostra,
        })
    blocos = {
        "fator_de_risco": caso.barreira or "",
        "itens_permitidos": itens,
        "relato_do_paciente": entrada.texto,
        "estado_do_caso": {"rodada": caso.rodada, "aceite_valido": aceite_valido(s, paciente.id)},
        "contexto_recuperado": [f.model_dump() for f in fontes],
    }
    if correcao:
        blocos["motivos_da_reprovacao_anterior"] = correcao
    resultado = modelo.chamar_com_ferramentas(
        PONTO, modelo.montar_mensagem(TAREFA, blocos), declarar_ferramentas(selecao.permitidos, fontes),
    )

    if not resultado.ok or resultado.ferramenta is None:
        motivo = (f"A chamada ao modelo falhou ({resultado.falha})." if not resultado.ok
                  else "O modelo não chamou nenhuma ferramenta.")
        ctx.evento("I03", "modelo", saida={
            **resultado.resumo(), "resumo": f"{motivo} O caso segue para tarefa manual.",
        }, chamada=resultado.metricas)
        return None

    # A regra vence o modelo: item, ferramenta e fontes são conferidos pelo código.
    escolha = resultado.argumentos or {}
    item = item_por_id(escolha.get("item_catalogo_id"))
    permitidos = {i.id for i in selecao.permitidos}
    if item is None or item.id not in permitidos or item.ferramenta != resultado.ferramenta:
        ctx.evento("I03", "modelo", saida={
            "item_escolhido": escolha.get("item_catalogo_id"), "ferramenta": resultado.ferramenta,
            "resumo": "O modelo escolheu um item fora dos permitidos. A escolha foi descartada.",
        }, chamada=resultado.metricas)
        return None
    por_id = {f.id: f for f in fontes}
    citadas = [por_id[i] for i in dict.fromkeys(escolha.get("fontes") or []) if i in por_id]

    acs = s.get(banco.Acs, paciente.acs_id)
    agora = relogio.agora()
    tentativas = len(s.exec(select(banco.Proposta).where(banco.Proposta.caso_id == caso.id)).all())
    proposta = banco.Proposta(
        id=banco.novo_id("pro"), caso_id=caso.id,
        relato_id=entrada.relato.id if entrada.relato else None,
        especialista="intervencao", item_catalogo_id=item.id, ferramenta=item.ferramenta,
        argumentos=montar_argumentos(item, paciente, acs, caso.barreira, escolha),
        justificativa=str(escolha.get("justificativa", "")).strip()[:600],
        fontes=[f.model_dump() for f in citadas], risco=item.risco, estado="pendente",
        verificacao=None, validade=agora + VALIDADE_DA_PROPOSTA, criado_em=agora,
        tentativa=2 if correcao else 1,
    )
    s.add(proposta)
    s.commit()
    ctx.evento("I03", "modelo", entrada={"itens_permitidos": [i["id"] for i in itens]}, saida={
        "proposta_id": proposta.id, "item_catalogo_id": item.id, "ferramenta": item.ferramenta,
        "fontes": [f.id for f in citadas], "executada": False, "propostas_no_caso": tentativas + 1,
        "resumo": f"Intervenção proposta: {item.nome}. A chamada de ferramenta virou proposta e não foi executada.",
    }, chamada=resultado.metricas)
    return proposta


def validade_padrao() -> timedelta:
    return VALIDADE_DA_PROPOSTA
