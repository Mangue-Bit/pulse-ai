"""Cliente único do modelo de linguagem.

Todas as chamadas do Pulse passam por aqui. Este módulo aplica a saída
estruturada, mede latência, tokens e custo, registra a versão do prompt e
trata recusa, erro de rede e saída inválida. Nenhuma falha vira exceção para
quem chama: o resultado diz o que houve e o fluxo segue para o caminho humano.
"""

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import groq
from pydantic import BaseModel, ValidationError

from app.config import configuracao
from app.rastro import MetricasChamada

PASTA_PROMPTS = Path(__file__).parent / "prompts"
MAXIMO_DE_TOKENS = 8000
MODELO_SIMULADO = "simulado-local"

# Preço em dólares por milhão de tokens (entrada, saída), da tabela pública da Groq.
# Modelo fora da tabela fica com custo desconhecido (None) no evento.
PRECOS: dict[str, tuple[float, float]] = {
    "openai/gpt-oss-120b": (0.15, 0.60),
    "openai/gpt-oss-20b": (0.075, 0.30),
    "openai/gpt-oss-safeguard-20b": (0.075, 0.30),
    "qwen/qwen3.8-27b": (0.80, 4.00),
    MODELO_SIMULADO: (0.0, 0.0),
}

Falha = str  # recusa | erro | saida_invalida | limite_de_tokens


# --- Prompts versionados ------------------------------------------------------

@dataclass(frozen=True)
class Prompt:
    nome: str
    versao: str       # por exemplo "interpretar_relato.v1"
    texto: str


def carregar_prompt(nome: str) -> Prompt:
    """Lê a versão mais recente de app/prompts/<nome>.v<N>.md."""
    candidatos: list[tuple[int, Path]] = []
    for caminho in PASTA_PROMPTS.glob(f"{nome}.v*.md"):
        achado = re.fullmatch(rf"{re.escape(nome)}\.v(\d+)", caminho.stem)
        if achado:
            candidatos.append((int(achado.group(1)), caminho))
    if not candidatos:
        raise FileNotFoundError(f"prompt não encontrado: {nome}")
    _, caminho = max(candidatos)
    return Prompt(nome=nome, versao=caminho.stem, texto=caminho.read_text(encoding="utf-8").strip())


# --- Texto de terceiros entra como dado ---------------------------------------

def bloco_de_dado(rotulo: str, conteudo: str) -> str:
    """Delimita um texto de paciente, de ACS ou de histórico como dado.

    Os sinais de menor e maior do conteúdo são trocados por equivalentes
    tipográficos, para que o texto não consiga fechar o bloco nem abrir outro.
    """
    if not re.fullmatch(r"[a-z_]+", rotulo):
        raise ValueError(f"rótulo inválido: {rotulo!r}")
    limpo = str(conteudo).replace("<", "‹").replace(">", "›")
    return f'<dado rotulo="{rotulo}">\n{limpo}\n</dado>'


def montar_mensagem(tarefa: str, blocos: dict[str, str | dict | list]) -> str:
    """Monta a mensagem do usuário: a tarefa (escrita no código) e os blocos de dado."""
    partes = [tarefa.strip()]
    for rotulo, conteudo in blocos.items():
        if not isinstance(conteudo, str):
            conteudo = json.dumps(conteudo, ensure_ascii=False, indent=2, default=str)
        partes.append(bloco_de_dado(rotulo, conteudo))
    return "\n\n".join(partes)


def extrair_blocos(mensagem: str) -> dict[str, str]:
    """Operação inversa de montar_mensagem, usada pelo cliente simulado e por testes."""
    achados = re.findall(r'<dado rotulo="([a-z_]+)">\n(.*?)\n</dado>', mensagem, flags=re.DOTALL)
    return {rotulo: conteudo.replace("‹", "<").replace("›", ">") for rotulo, conteudo in achados}


# --- Resultado de uma chamada -------------------------------------------------

@dataclass
class RespostaBruta:
    """O que um cliente devolve antes das conferências deste módulo."""

    motivo_parada: str                      # end_turn | tool_use | refusal | max_tokens
    modelo: str
    saida: BaseModel | None = None
    ferramenta: str | None = None
    argumentos: dict | None = None
    tokens_entrada: int = 0
    tokens_saida: int = 0


@dataclass
class Resultado:
    ok: bool
    metricas: MetricasChamada
    saida: BaseModel | None = None
    ferramenta: str | None = None
    argumentos: dict | None = None
    falha: Falha | None = None
    detalhe: str | None = None

    def resumo(self) -> dict:
        """Forma curta para a saída de um evento do rastro."""
        if self.ok:
            return {"chamada": "ok"}
        return {"chamada": "falhou", "falha": self.falha, "detalhe": self.detalhe}


class Cliente(Protocol):
    def estruturado(
        self, *, ponto: str, modelo: str, sistema: str, mensagem: str,
        esquema: type[BaseModel], esforco: str,
    ) -> RespostaBruta: ...

    def com_ferramentas(
        self, *, ponto: str, modelo: str, sistema: str, mensagem: str,
        ferramentas: list[dict], esforco: str,
    ) -> RespostaBruta: ...


# --- Cliente real -------------------------------------------------------------

_SO_NO_PYDANTIC = {
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength",
    "pattern", "format", "default", "minItems", "maxItems",
}


def esquema_estrito(esquema: type[BaseModel]) -> dict:
    """Esquema JSON do modelo Pydantic no formato do modo estrito da Groq.

    Todo objeto recusa propriedades extras e exige todas as que declara; campo
    opcional é união com nulo. Limites numéricos e de tamanho saem do esquema
    enviado e continuam valendo na validação feita aqui, pelo Pydantic.
    """

    def ajustar(no):
        if isinstance(no, list):
            return [ajustar(item) for item in no]
        if not isinstance(no, dict):
            return no
        limpo = {k: ajustar(v) for k, v in no.items() if k not in _SO_NO_PYDANTIC}
        if limpo.get("type") == "object" and "properties" in limpo:
            limpo["additionalProperties"] = False
            limpo["required"] = list(limpo["properties"])
        return limpo

    bruto = esquema.model_json_schema()
    estrito = ajustar(bruto)
    if "$defs" in bruto:
        estrito["$defs"] = {nome: ajustar(definicao) for nome, definicao in bruto["$defs"].items()}
    return estrito


def _com_raciocinio(modelo: str, esforco: str) -> dict:
    """Parâmetros de raciocínio, aceitos pelos modelos GPT-OSS da Groq."""
    if modelo.startswith("openai/gpt-oss"):
        return {"reasoning_effort": esforco, "include_reasoning": False}
    return {}


_MOTIVOS = {
    "stop": "end_turn", "length": "max_tokens", "tool_calls": "tool_use",
    "content_filter": "refusal",
}


@dataclass
class ClienteGroq:
    """Chama a API da Groq pelo SDK oficial."""

    api: groq.Groq = field(default_factory=lambda: groq.Groq(timeout=60.0, max_retries=2))

    def _bruta(self, resposta) -> tuple[RespostaBruta, object]:
        escolha = resposta.choices[0]
        uso = resposta.usage
        bruta = RespostaBruta(
            motivo_parada=_MOTIVOS.get(escolha.finish_reason or "", escolha.finish_reason or ""),
            modelo=resposta.model,
            tokens_entrada=uso.prompt_tokens if uso else 0,
            tokens_saida=uso.completion_tokens if uso else 0,
        )
        return bruta, escolha.message

    def estruturado(self, *, ponto, modelo, sistema, mensagem, esquema, esforco) -> RespostaBruta:
        resposta = self.api.chat.completions.create(
            model=modelo,
            max_completion_tokens=MAXIMO_DE_TOKENS,
            messages=[
                {"role": "system", "content": sistema},
                {"role": "user", "content": mensagem},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": ponto, "strict": True, "schema": esquema_estrito(esquema)},
            },
            **_com_raciocinio(modelo, esforco),
        )
        bruta, mensagem_do_modelo = self._bruta(resposta)
        if bruta.motivo_parada == "end_turn":
            bruta.saida = esquema.model_validate_json(mensagem_do_modelo.content or "")
        return bruta

    def com_ferramentas(self, *, ponto, modelo, sistema, mensagem, ferramentas, esforco) -> RespostaBruta:
        resposta = self.api.chat.completions.create(
            model=modelo,
            max_completion_tokens=MAXIMO_DE_TOKENS,
            messages=[
                {"role": "system", "content": sistema},
                {"role": "user", "content": mensagem},
            ],
            tools=[
                {"type": "function", "function": {
                    "name": f["name"], "description": f["description"], "parameters": f["input_schema"],
                }}
                for f in ferramentas
            ],
            tool_choice="auto",
            **_com_raciocinio(modelo, esforco),
        )
        bruta, mensagem_do_modelo = self._bruta(resposta)
        chamadas = mensagem_do_modelo.tool_calls or []
        if chamadas:
            # Só a primeira chamada é considerada, e ela não é executada: vira proposta.
            bruta.ferramenta = chamadas[0].function.name
            bruta.argumentos = json.loads(chamadas[0].function.arguments or "{}")
        return bruta


# --- Seleção do cliente -------------------------------------------------------

_cliente: Cliente | None = None


def cliente() -> Cliente:
    global _cliente
    if _cliente is None:
        if configuracao().modelo_simulado:
            from app.modelo_simulado import ClienteSimulado

            _cliente = ClienteSimulado()
        else:
            _cliente = ClienteGroq()
    return _cliente


def usar_cliente(novo: Cliente | None) -> None:
    """Troca o cliente em uso. Com None, a próxima chamada escolhe de novo pela configuração."""
    global _cliente
    _cliente = novo


def em_modo_simulado() -> bool:
    from app.modelo_simulado import ClienteSimulado

    return isinstance(cliente(), ClienteSimulado)


# --- Chamadas -----------------------------------------------------------------

def _custo(modelo: str, tokens_entrada: int, tokens_saida: int) -> float | None:
    if modelo not in PRECOS:
        return None
    entrada, saida = PRECOS[modelo]
    return round((tokens_entrada * entrada + tokens_saida * saida) / 1_000_000, 8)


def _executar(prompt: Prompt, modelo: str, chamar) -> Resultado:
    inicio = time.perf_counter()
    bruta: RespostaBruta | None = None
    falha: Falha | None = None
    detalhe: str | None = None
    try:
        bruta = chamar()
    except ValidationError as erro:
        falha, detalhe = "saida_invalida", f"{erro.error_count()} campo(s) fora do esquema"
    except json.JSONDecodeError:
        falha, detalhe = "saida_invalida", "argumentos da ferramenta fora do formato JSON"
    except groq.APIConnectionError as erro:
        falha, detalhe = "erro", f"rede: {type(erro).__name__}"
    except groq.BadRequestError:
        # A Groq devolve 400 quando o modelo gera saída ou chamada de ferramenta fora do esquema.
        falha, detalhe = "saida_invalida", "api: 400"
    except groq.APIStatusError as erro:
        falha, detalhe = "erro", f"api: {erro.status_code}"
    except Exception as erro:  # qualquer outra falha também segue para o caminho humano
        falha, detalhe = "erro", type(erro).__name__
    latencia = int((time.perf_counter() - inicio) * 1000)

    modelo_usado = bruta.modelo if bruta else modelo
    tokens_entrada = bruta.tokens_entrada if bruta else 0
    tokens_saida = bruta.tokens_saida if bruta else 0
    metricas = MetricasChamada(
        modelo=modelo_usado,
        versao_prompt=prompt.versao,
        latencia_ms=latencia,
        tokens_entrada=tokens_entrada,
        tokens_saida=tokens_saida,
        custo=_custo(modelo_usado, tokens_entrada, tokens_saida),
    )
    if bruta is None:
        return Resultado(ok=False, metricas=metricas, falha=falha, detalhe=detalhe)
    # O motivo da parada é conferido antes de qualquer leitura do conteúdo.
    if bruta.motivo_parada == "refusal":
        return Resultado(ok=False, metricas=metricas, falha="recusa", detalhe="o modelo recusou")
    if bruta.motivo_parada == "max_tokens":
        return Resultado(ok=False, metricas=metricas, falha="limite_de_tokens", detalhe="saída cortada")
    return Resultado(
        ok=True, metricas=metricas, saida=bruta.saida,
        ferramenta=bruta.ferramenta, argumentos=bruta.argumentos,
    )


def chamar_estruturado(
    ponto: str,
    mensagem: str,
    esquema: type[BaseModel],
    *,
    modelo: str | None = None,
    esforco: str = "medium",
) -> Resultado:
    """Chamada com saída estruturada. `resultado.saida` é uma instância de `esquema`."""
    prompt = carregar_prompt(ponto)
    nome_modelo = modelo or configuracao().modelo
    resultado = _executar(prompt, nome_modelo, lambda: cliente().estruturado(
        ponto=ponto, modelo=nome_modelo, sistema=prompt.texto,
        mensagem=mensagem, esquema=esquema, esforco=esforco,
    ))
    if resultado.ok and not isinstance(resultado.saida, esquema):
        resultado.ok = False
        resultado.saida = None
        resultado.falha, resultado.detalhe = "saida_invalida", "resposta fora do esquema"
    return resultado


def chamar_com_ferramentas(
    ponto: str,
    mensagem: str,
    ferramentas: list[dict],
    *,
    modelo: str | None = None,
    esforco: str = "medium",
) -> Resultado:
    """Chamada com ferramentas declaradas. O `tool_use` devolvido não é executado aqui.

    Com `ok` verdadeiro e `ferramenta` vazia, o modelo não chamou ferramenta.
    """
    prompt = carregar_prompt(ponto)
    nome_modelo = modelo or configuracao().modelo
    resultado = _executar(prompt, nome_modelo, lambda: cliente().com_ferramentas(
        ponto=ponto, modelo=nome_modelo, sistema=prompt.texto,
        mensagem=mensagem, ferramentas=ferramentas, esforco=esforco,
    ))
    nomes = {f["name"] for f in ferramentas}
    if resultado.ok and resultado.ferramenta is not None and resultado.ferramenta not in nomes:
        resultado.ok = False
        resultado.falha, resultado.detalhe = "saida_invalida", "ferramenta não declarada"
        resultado.ferramenta, resultado.argumentos = None, None
    return resultado
