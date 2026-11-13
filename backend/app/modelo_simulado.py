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
