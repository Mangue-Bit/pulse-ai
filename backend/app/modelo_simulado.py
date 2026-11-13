"""Cliente de modelo simulado.

Usado quando não há chave de API e nos testes. Responde por heurísticas
determinísticas, respeitando o mesmo esquema de saída do cliente real. Os
eventos gravados com este cliente levam o modelo "simulado-local".
"""

from collections.abc import Callable
from dataclasses import dataclass, field

from pydantic import BaseModel

from app.modelo import MODELO_SIMULADO, RespostaBruta, extrair_blocos

Simulador = Callable[[dict[str, str]], dict | tuple[str, dict] | None]

_simuladores: dict[str, Simulador] = {}


def simulador(ponto: str) -> Callable[[Simulador], Simulador]:
    """Registra a função que responde, no modo simulado, pelo ponto de chamada."""

    def registrar(funcao: Simulador) -> Simulador:
        _simuladores[ponto] = funcao
        return funcao

    return registrar


def _tokens(texto: str) -> int:
    return max(1, len(texto) // 4)


@dataclass
class ClienteSimulado:
    chamadas: list[dict] = field(default_factory=list)

    def _responder(self, ponto: str, sistema: str, mensagem: str):
        if ponto not in _simuladores:
            raise LookupError(f"sem simulador para o ponto de chamada {ponto!r}")
        self.chamadas.append({"ponto": ponto, "sistema": sistema, "mensagem": mensagem})
        return _simuladores[ponto](extrair_blocos(mensagem))

    def estruturado(self, *, ponto, modelo, sistema, mensagem, esquema: type[BaseModel], esforco) -> RespostaBruta:
        resposta = self._responder(ponto, sistema, mensagem)
        saida = esquema.model_validate(resposta)
        return RespostaBruta(
            motivo_parada="end_turn", modelo=MODELO_SIMULADO, saida=saida,
            tokens_entrada=_tokens(sistema + mensagem),
            tokens_saida=_tokens(saida.model_dump_json()),
        )

    def com_ferramentas(self, *, ponto, modelo, sistema, mensagem, ferramentas, esforco) -> RespostaBruta:
        resposta = self._responder(ponto, sistema, mensagem)
        bruta = RespostaBruta(
            motivo_parada="end_turn", modelo=MODELO_SIMULADO,
            tokens_entrada=_tokens(sistema + mensagem), tokens_saida=8,
        )
        if resposta is not None:
            bruta.motivo_parada = "tool_use"
            bruta.ferramenta, bruta.argumentos = resposta
            bruta.tokens_saida = _tokens(str(bruta.argumentos))
        return bruta


# --- Ponto 1: triagem e interpretação do relato -------------------------------

_BARREIRAS_POR_TERMO: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("analfabetismo", (
        "nao consigo ler", "nao sei ler", "nao leio", "ler a receita", "ler a bula", "ler a caixa",
        "nao entendo a letra", "letrinha", "nao enxergo as letras", "nao entendo o que ta escrito",
    )),
    ("muitos_medicamentos", (
        "remedio demais", "muito remedio", "muitos remedios", "tanto remedio", "me atrapalho",
        "me confundo", "confundo", "me perco", "nao sei qual", "varios comprimidos", "um monte de remedio",
    )),
    ("acesso_a_remedios", (
        "acabou", "faltou", "nao tinha", "nao tem na farmacia", "sem dinheiro", "caro", "nao consigo buscar",
        "nao consegui pegar", "posto ta sem", "fica longe", "receita venceu",
    )),
    ("percepcao_de_melhora", (
        "pressao ta boa", "to bem", "estou bem", "me sinto bem", "melhorei", "nao preciso mais",
        "sarei", "ja to bom", "ja to boa", "parei porque",
    )),
    ("rede_de_apoio", (
        "sozinha", "sozinho", "ninguem", "nao tem quem", "esqueco", "minha filha mudou", "quem me ajud",
    )),
)
_TERMOS_DE_TRATAMENTO = (
    "remedio", "comprimido", "tomar", "tomo", "tomando", "tratamento", "pressao", "diabetes",
    "receita", "insulina", "medicamento", "dose",
)
_TERMOS_DE_DUVIDA = (
    "posso tomar", "pode tomar", "posso parar", "devo tomar", "dose", "faz mal", "efeito colateral",
    "posso beber", "quantos comprimidos", "tomo dois", "e normal",
)
_TERMOS_DE_LEMBRETE = ("me lembra", "me lembrar", "lembrete", "me avisa", "me avisar")


def _normalizar(texto: str) -> str:
    import re
    import unicodedata

    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", sem_acento).strip()


def _oracao_com(texto: str, termo: str) -> str:
    """A oração da mensagem original em que o termo aparece."""
    import re

    for oracao in re.split(r"(?<=[.!?;\n])\s*", texto):
        if termo in _normalizar(oracao):
            return oracao.strip()
    return texto.strip()


@simulador("interpretar_relato")
def _interpretar_relato(blocos: dict[str, str]) -> dict:
    texto = blocos.get("mensagem_do_paciente", "")
    normal = _normalizar(texto)
    resposta = {
        "urgencia": False, "entendivel": True, "duvida_clinica": False, "tipo": "relato",
        "barreira": None, "trecho_literal": texto.strip(), "certeza": 0.3, "lembrete": None,
    }
    if any(termo in normal for termo in _TERMOS_DE_LEMBRETE):
        resposta["lembrete"] = "pedido de lembrete do remédio"
    for termo in _TERMOS_DE_DUVIDA:
        if termo in normal:
            return {**resposta, "duvida_clinica": True, "tipo": "duvida", "certeza": 0.9,
                    "trecho_literal": _oracao_com(texto, termo)}
    for barreira, termos in _BARREIRAS_POR_TERMO:
        for termo in termos:
            if termo in normal:
                return {**resposta, "barreira": barreira, "certeza": 0.88,
                        "trecho_literal": _oracao_com(texto, termo)}
    if any(termo in normal for termo in _TERMOS_DE_TRATAMENTO):
        return {**resposta, "barreira": "nao_identificada", "certeza": 0.4}
    if resposta["lembrete"]:
        return {**resposta, "barreira": "nao_identificada", "certeza": 0.7}
    return {**resposta, "entendivel": False, "certeza": 0.2}


# --- Pontos 2 a 6: Cuidado ------------------------------------------------------
# Respostas mínimas e determinísticas, para a demonstração sem chave e para os
# testes. As conferências do código (item permitido, fonte citada, frase com
# fonte) continuam valendo: o simulador só escolhe o caminho mais simples.

_ESPECIALISTAS_POR_ENTRADA = {"registro_acs": ["relatorio"]}


def _json(blocos: dict[str, str], rotulo: str, padrao):
    import json

    try:
        return json.loads(blocos.get(rotulo, ""))
    except ValueError:
        return padrao


def _fonte_preferida(fontes: list[dict]) -> str | None:
    """Primeiro trecho do corpus; o histórico só serve se não houver outro."""
    ordenadas = sorted(fontes, key=lambda f: f.get("origem") == "historico")
    return ordenadas[0]["id"] if ordenadas else None


@simulador("delegar")
def _delegar(blocos: dict[str, str]) -> dict:
    tipo = blocos.get("tipo_de_entrada", "relato").strip()
    return {"especialistas": _ESPECIALISTAS_POR_ENTRADA.get(tipo, ["intervencao"]), "informacao_faltante": None}


@simulador("escolher_intervencao")
def _escolher_intervencao(blocos: dict[str, str]) -> tuple[str, dict] | None:
    itens = _json(blocos, "itens_permitidos", [])
    fonte = _fonte_preferida(_json(blocos, "contexto_recuperado", []))
    if not itens or fonte is None:
        return None
    item = min(itens, key=lambda i: i.get("posicao", 0))
    argumentos = {
        "item_catalogo_id": item["id"],
        "justificativa": f"O item responde ao fator de risco {blocos.get('fator_de_risco', '').strip()} "
                         "e é o primeiro da ordem do catálogo para este caso.",
        "fontes": [fonte],
    }
    if item["ferramenta"] == "enviar_mensagem":
        argumentos["canal"] = item.get("canal_preferido") if item.get("canal_preferido") in ("texto", "audio") else "texto"
    else:
        argumentos["tipo"] = "visita"
    return item["ferramenta"], argumentos


@simulador("verificar_proposta")
def _verificar_proposta(blocos: dict[str, str]) -> dict:
    return {"aprovada": True, "motivos": []}


@simulador("redigir_relatorio")
def _redigir_relatorio(blocos: dict[str, str]) -> dict:
    material = _json(blocos, "material_do_paciente", [])
    frases = [
        {"texto": f"{m.get('titulo', 'Registro')}: {m.get('trecho', '').strip()[:240]}", "fonte_id": m["id"]}
        for m in material[:3] if m.get("id")
    ]
    return {"frases": frases}
