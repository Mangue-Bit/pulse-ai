"""Agente de Relatório (R01 a R03).

Redige o relatório do paciente a partir do registro do ACS e do histórico.
Cada frase aponta a sua fonte, e o código descarta toda frase cuja fonte não
esteja entre os trechos reunidos.
"""

from typing import TYPE_CHECKING

from pydantic import BaseModel

from app import banco, modelo, rastro, relogio
from app.contratos import Fonte
from app.regras.limites import VALIDADE_DA_PROPOSTA

if TYPE_CHECKING:
    from app.cuidado.entrada import Entrada

PONTO = "redigir_relatorio"
TAREFA = (
    "Redija o relatório do paciente a partir do material reunido nos blocos de dado abaixo: "
    "o que mudou e o que ficou pendente. Cada frase precisa apontar a fonte de onde saiu."
)
MAXIMO_DE_FRASES = 8


class Frase(BaseModel):
    texto: str
    fonte_id: str


class Rascunho(BaseModel):
    frases: list[Frase]


def descartar_sem_fonte(frases: list[Frase], fontes: list[Fonte]) -> tuple[list[Frase], list[Frase]]:
    """R03: frase sem fonte não entra. Devolve as mantidas e as descartadas."""
    conhecidas = {f.id for f in fontes}
    mantidas = [f for f in frases if f.texto.strip() and f.fonte_id in conhecidas]
    descartadas = [f for f in frases if f not in mantidas]
    return mantidas[:MAXIMO_DE_FRASES], descartadas


def propor(ctx: rastro.Contexto, caso: banco.Caso, paciente: banco.Paciente,
           entrada: "Entrada", fontes: list[Fonte], correcao: list[str] | None = None) -> banco.Proposta | None:
    s = ctx.sessao
    # R01: junta registro e histórico
    material = [f for f in fontes if f.origem == "historico"]
    apoio = [f for f in fontes if f.origem != "historico"]
    ctx.evento("R01", "regra", saida={
        "registros": [f.id for f in material], "trechos_de_apoio": [f.id for f in apoio],
        "resumo": f"Material reunido: {len(material)} registro(s) do paciente e {len(apoio)} trecho(s) de apoio.",
    })
    if not material:
        return None

    # R02: redige o relatório (ponto de chamada 4)
    blocos = {
        "material_do_paciente": [f.model_dump() for f in material],
        "trechos_de_apoio": [f.model_dump() for f in apoio],
    }
    if correcao:
        blocos["motivos_da_reprovacao_anterior"] = correcao
    resultado = modelo.chamar_estruturado(PONTO, modelo.montar_mensagem(TAREFA, blocos), Rascunho)
    if not resultado.ok:
        ctx.evento("R02", "modelo", saida={
            **resultado.resumo(),
            "resumo": f"A chamada ao modelo falhou ({resultado.falha}). O caso segue para tarefa manual.",
        }, chamada=resultado.metricas)
        return None
    rascunho: Rascunho = resultado.saida
    ctx.evento("R02", "modelo", saida={
        "frases": len(rascunho.frases), "resumo": f"Rascunho redigido com {len(rascunho.frases)} frase(s).",
    }, chamada=resultado.metricas)

    # R03: cita a fonte de cada frase; frase sem fonte não entra
    mantidas, descartadas = descartar_sem_fonte(rascunho.frases, fontes)
    ctx.evento("R03", "regra", saida={
        "mantidas": len(mantidas), "descartadas": [f.model_dump() for f in descartadas],
        "resumo": f"{len(mantidas)} frase(s) com fonte mantida(s) e {len(descartadas)} descartada(s) por falta de fonte.",
    })
    if not mantidas:
        return None

    por_id = {f.id: f for f in fontes}
    citadas = [por_id[i] for i in dict.fromkeys(f.fonte_id for f in mantidas)]
    agora = relogio.agora()
    proposta = banco.Proposta(
        id=banco.novo_id("pro"), caso_id=caso.id, relato_id=None, especialista="relatorio",
        item_catalogo_id=None, ferramenta="salvar_relatorio",
        argumentos={"paciente_id": paciente.id, "frases": [f.model_dump() for f in mantidas]},
        justificativa="Relatório redigido a partir do registro do ACS e do histórico do paciente, com a fonte de cada frase.",
        fontes=[f.model_dump() for f in citadas], risco="baixo", estado="pendente", verificacao=None,
        validade=agora + VALIDADE_DA_PROPOSTA, criado_em=agora, tentativa=2 if correcao else 1,
    )
    s.add(proposta)
    s.commit()
    return proposta
