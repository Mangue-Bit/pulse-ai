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


# --- I02: regras que filtram o catálogo ---------------------------------------

from dataclasses import dataclass, field  # noqa: E402

from sqlmodel import Session, select  # noqa: E402

from app import banco  # noqa: E402
from app.regras.limites import AMOSTRA_MINIMA  # noqa: E402


@dataclass
class Selecao:
    permitidos: list[ItemCatalogo] = field(default_factory=list)
    excluidos: list[dict] = field(default_factory=list)   # {"id", "motivo"}


def taxa_atual(s: Session, item: ItemCatalogo) -> tuple[float | None, int]:
    """Taxa de sucesso e amostra do item: a base do catálogo somada aos resultados registrados."""
    resultados = s.exec(select(banco.Resultado).where(banco.Resultado.item_catalogo_id == item.id)).all()
    amostra = item.amostra + len(resultados)
    if amostra == 0:
        return None, 0
    sucessos = round((item.taxa_sucesso or 0) * item.amostra) + sum(1 for r in resultados if r.barreira_resolvida)
    return round(sucessos / amostra, 3), amostra


def itens_permitidos(
    s: Session, barreira: str | None, *, tem_aceite: bool, ja_tentados: set[str] | None = None,
) -> Selecao:
    """Itens do catálogo que podem ser propostos para a barreira e o estado do paciente.

    Regras fixas: sem aceite, só ações presenciais do ACS; item já tentado sem
    sucesso no caso não se repete; analfabetismo prefere áudio; o restante é
    ordenado pela taxa de sucesso, só para itens com amostra mínima.
    """
    selecao = Selecao()
    ja_tentados = ja_tentados or set()
    candidatos: list[tuple[tuple, ItemCatalogo]] = []
    for posicao, item in enumerate(carregar_catalogo()):
        if barreira not in item.barreiras:
            continue
        if item.exige_aceite and not tem_aceite:
            selecao.excluidos.append({"id": item.id, "motivo": "exige aceite, e o paciente não tem aceite válido"})
            continue
        if item.id in ja_tentados:
            selecao.excluidos.append({"id": item.id, "motivo": "já tentado neste caso sem resolver a barreira"})
            continue
        taxa, amostra = taxa_atual(s, item)
        tem_amostra = amostra >= AMOSTRA_MINIMA and taxa is not None
        prefere_audio = barreira == "analfabetismo" and item.canal_preferido == "audio"
        ordem = (0 if prefere_audio else 1, 0 if tem_amostra else 1, -(taxa or 0) if tem_amostra else 0, posicao)
        candidatos.append((ordem, item))
    selecao.permitidos = [item for _, item in sorted(candidatos, key=lambda par: par[0])]
    return selecao
