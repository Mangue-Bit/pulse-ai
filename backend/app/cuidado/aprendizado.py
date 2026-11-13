"""Ciclo de aprendizado (C40).

Resultados, recusas e edições viram dado. O resultado registrado atualiza a
taxa de sucesso do item, e o catálogo passa a ser ordenado por ela, só para
itens com amostra mínima. O caso fica marcado como tendo recebido intervenção,
para um novo treino do modelo de risco não confundir abandono evitado com baixo risco.
"""

from app import banco, rastro
from app.regras.catalogo import carregar_catalogo, item_por_id, taxa_atual
from app.regras.limites import AMOSTRA_MINIMA


def ordem_do_catalogo(s, barreira: str | None) -> list[dict]:
    """Os itens da barreira com a taxa e a amostra atuais, na ordem em que serão oferecidos."""
    itens = []
    for item in carregar_catalogo():
        if barreira in item.barreiras:
            taxa, amostra = taxa_atual(s, item)
            itens.append({"id": item.id, "taxa_sucesso": taxa, "amostra": amostra,
                          "entra_na_ordenacao": amostra >= AMOSTRA_MINIMA})
    return sorted(itens, key=lambda i: (not i["entra_na_ordenacao"], -(i["taxa_sucesso"] or 0)))


def registrar(ctx: rastro.Contexto, caso: banco.Caso, resultado: banco.Resultado) -> None:
    item = item_por_id(resultado.item_catalogo_id)
    taxa, amostra = taxa_atual(ctx.sessao, item) if item else (None, 0)
    ctx.evento("C40", "regra", entrada={"resultado_id": resultado.id}, saida={
        "item_catalogo_id": resultado.item_catalogo_id, "barreira_resolvida": resultado.barreira_resolvida,
        "taxa_sucesso": taxa, "amostra": amostra, "amostra_minima": AMOSTRA_MINIMA,
        "recebeu_intervencao": caso.recebeu_intervencao,
        "ordem_do_catalogo": ordem_do_catalogo(ctx.sessao, caso.barreira),
        "resumo": (f"Resultado virou dado de aprendizado: o item passa a ter taxa de sucesso de {taxa:.0%} "
                   f"em {amostra} registro(s)." if taxa is not None else "Resultado virou dado de aprendizado.")
                  + (" Ainda abaixo da amostra mínima, não entra na ordenação." if amostra < AMOSTRA_MINIMA else ""),
    })
