"""Verificador independente (C18) e nova tentativa (C19).

Regras e um segundo modelo conferem a proposta: sem conduta clínica? Tem
fonte? Está no catálogo? As regras rodam antes e bastam para reprovar. A
proposta reprovada é refeita uma vez; se falhar de novo, volta à equipe sem
proposta, com o motivo.
"""

from typing import TYPE_CHECKING

from pydantic import BaseModel

from app import banco, modelo, rastro
from app.config import configuracao
from app.contratos import Fonte
from app.regras.catalogo import item_por_id
from app.regras.conduta import conduta_clinica

if TYPE_CHECKING:
    from app.cuidado.entrada import Entrada

PONTO = "verificar_proposta"
TAREFA = (
    "Confira a proposta descrita nos blocos de dado abaixo e diga se ela pode seguir para a "
    "aprovação da equipe de saúde."
)


class Verificacao(BaseModel):
    aprovada: bool
    motivos: list[str]


def textos_da_proposta(proposta: banco.Proposta) -> list[str]:
    """Tudo o que a proposta diria a alguém: a justificativa e o texto da ação."""
    argumentos = proposta.argumentos or {}
    textos = [proposta.justificativa, str(argumentos.get("texto", "")), str(argumentos.get("descricao", ""))]
    textos += [str(frase.get("texto", "")) for frase in argumentos.get("frases", []) if isinstance(frase, dict)]
    return [t for t in textos if t]


def conferir_regras(proposta: banco.Proposta, fontes_recuperadas: list[Fonte]) -> list[dict]:
    """As três conferências por regra. Cada uma devolve se passou e o detalhe."""
    regras = []

    achado = next((c for c in map(conduta_clinica, textos_da_proposta(proposta)) if c), None)
    regras.append({
        "regra": "sem_conduta_clinica", "passou": achado is None,
        "detalhe": "Sem dose, horário, troca ou interrupção de medicamento." if achado is None
        else f"O texto da proposta traz conduta clínica ({achado}).",
    })

    recuperadas = {f.id for f in fontes_recuperadas}
    citadas = [f.get("id") for f in proposta.fontes or []]
    tem_fonte = bool(citadas) and all(i in recuperadas for i in citadas)
    regras.append({
        "regra": "tem_fonte", "passou": tem_fonte,
        "detalhe": f"{len(citadas)} fonte(s) citada(s), todas do contexto recuperado." if tem_fonte
        else ("A proposta não cita nenhuma fonte." if not citadas
              else "A proposta cita fonte que não está no contexto recuperado."),
    })

    if proposta.especialista == "intervencao":
        item = item_por_id(proposta.item_catalogo_id)
        no_catalogo = item is not None and item.ferramenta == proposta.ferramenta and item.risco == proposta.risco
        regras.append({
            "regra": "esta_no_catalogo", "passou": no_catalogo,
            "detalhe": "Item, ferramenta e risco conferem com o catálogo." if no_catalogo
            else "O item, a ferramenta ou o risco não conferem com o catálogo.",
        })
    return regras


def _conferir(ctx: rastro.Contexto, proposta: banco.Proposta, entrada: "Entrada",
              fontes: list[Fonte]) -> dict:
    """C18: regras e segundo modelo. Devolve o resultado gravado em proposta.verificacao."""
    regras = conferir_regras(proposta, fontes)
    reprovadas = [r["detalhe"] for r in regras if not r["passou"]]
    if reprovadas:
        verificacao = {"aprovada": False, "motivos": reprovadas, "regras": regras, "modelo": None}
        ctx.evento("C18", "regra", entrada={"proposta_id": proposta.id}, saida={
            **verificacao, "decisao": "não",
            "resumo": f"Reprovada pelas regras, sem consultar o segundo modelo: {reprovadas[0]}",
        })
        return verificacao
    ctx.evento("C18", "regra", entrada={"proposta_id": proposta.id}, saida={
        "regras": regras, "resumo": "As regras passaram: sem conduta clínica, com fonte e dentro do catálogo.",
    })

    item = item_por_id(proposta.item_catalogo_id)
    mensagem = modelo.montar_mensagem(TAREFA, {
        "proposta": {
            "especialista": proposta.especialista, "ferramenta": proposta.ferramenta,
            "item_do_catalogo": item.nome if item else None,
            "justificativa": proposta.justificativa,
            "texto_da_acao": proposta.argumentos.get("texto") or proposta.argumentos.get("descricao")
            or proposta.argumentos.get("frases"),
        },
        "fontes_citadas": proposta.fontes,
        "relato_ou_registro": entrada.texto,
    })
    resultado = modelo.chamar_estruturado(
        PONTO, mensagem, Verificacao, modelo=configuracao().modelo_verificador, esforco="low",
    )
    if not resultado.ok:
        motivo = f"O verificador não respondeu ({resultado.falha}). Sem verificação, a proposta não segue."
        verificacao = {"aprovada": False, "motivos": [motivo], "regras": regras, "modelo": resultado.metricas.modelo}
        ctx.evento("C18", "modelo", saida={**resultado.resumo(), "decisao": "não", "resumo": motivo},
                   chamada=resultado.metricas)
        return verificacao
    saida: Verificacao = resultado.saida
    motivos = [m.strip()[:300] for m in saida.motivos if m.strip()]
    if not saida.aprovada and not motivos:
        motivos = ["O verificador reprovou a proposta sem informar o motivo."]
    verificacao = {
        "aprovada": saida.aprovada, "motivos": motivos if not saida.aprovada else [],
        "regras": regras, "modelo": resultado.metricas.modelo,
    }
    ctx.evento("C18", "modelo", saida={
        "decisao": "sim" if saida.aprovada else "não", "motivos": verificacao["motivos"],
        "resumo": "O segundo modelo aprovou a proposta." if saida.aprovada
        else f"O segundo modelo reprovou a proposta: {motivos[0]}",
    }, chamada=resultado.metricas)
    return verificacao


def _gravar(ctx: rastro.Contexto, proposta: banco.Proposta, verificacao: dict) -> None:
    proposta.verificacao = verificacao
    if not verificacao["aprovada"]:
        proposta.estado = "cancelada"
        proposta.motivo = "Reprovada pelo verificador: " + " ".join(verificacao["motivos"])[:400]
    ctx.sessao.add(proposta)
    ctx.sessao.commit()


def verificar(ctx: rastro.Contexto, caso: banco.Caso, paciente: banco.Paciente, entrada: "Entrada",
              proposta: banco.Proposta, fontes: list[Fonte]) -> banco.Proposta | None:
    """Devolve a proposta que pode ir para a fila, ou None se o caso volta à equipe sem proposta."""
    from app.cuidado import orquestrador
    from app.cuidado.especialistas import intervencao, relatorio

    verificacao = _conferir(ctx, proposta, entrada, fontes)
    _gravar(ctx, proposta, verificacao)
    if verificacao["aprovada"]:
        return proposta

    # C19: refaz uma vez, informando o motivo da reprovação.
    ctx.evento("C19", "regra", entrada={"proposta_id": proposta.id}, saida={
        "tentativa": 2, "motivos": verificacao["motivos"],
        "resumo": "Proposta reprovada: o especialista refaz uma vez, com o motivo da reprovação.",
    })
    refazer = intervencao.propor if proposta.especialista == "intervencao" else relatorio.propor
    nova = refazer(ctx, caso, paciente, entrada, fontes, correcao=verificacao["motivos"])
    if nova is not None:
        segunda = _conferir(ctx, nova, entrada, fontes)
        _gravar(ctx, nova, segunda)
        if segunda["aprovada"]:
            return nova
        motivos = segunda["motivos"]
    else:
        motivos = ["O especialista não conseguiu refazer a proposta."]
    ctx.evento("C19", "regra", saida={
        "devolvido_a_equipe": True, "motivos": motivos,
        "resumo": "A segunda tentativa também falhou: o caso volta à equipe sem proposta, com o motivo.",
    })
    orquestrador.tarefa_manual(ctx, caso, "O verificador reprovou a proposta duas vezes. " + motivos[0])
    return None
