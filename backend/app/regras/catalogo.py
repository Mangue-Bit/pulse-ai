"""Catálogo de intervenções. Risco e intervenções vêm daqui, nunca do modelo."""

import json
from functools import lru_cache

from app.config import PASTA_DADOS
from app.contratos import ItemCatalogo

FERRAMENTAS = ("enviar_mensagem", "criar_tarefa_acs", "salvar_relatorio", "atualizar_lista")
CAMINHO = PASTA_DADOS / "catalogo.json"


@lru_cache(maxsize=1)
def carregar_catalogo() -> tuple[ItemCatalogo, ...]:
    bruto = json.loads(CAMINHO.read_text(encoding="utf-8"))
    itens = tuple(ItemCatalogo.model_validate(item) for item in bruto["itens"])
    ids = [item.id for item in itens]
    if len(ids) != len(set(ids)):
        raise ValueError("catálogo com identificador repetido")
    for item in itens:
        if item.ferramenta not in FERRAMENTAS:
            raise ValueError(f"item {item.id} aponta para ferramenta desconhecida: {item.ferramenta}")
    return itens


def item_por_id(item_id: str | None) -> ItemCatalogo | None:
    return next((item for item in carregar_catalogo() if item.id == item_id), None)
