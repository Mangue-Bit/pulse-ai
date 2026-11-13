"""Entradas e triagem do Cuidado (C01 a C06).

Toda entrada chega ao filtro pelo mesmo caminho: relato estruturado da Escuta
(E12), paciente sinalizado pelo risco de abandono (C01), registro do ACS (C02)
e checagem por tempo (C03). Texto de paciente, de ACS e de histórico segue
como dado, nunca como instrução.
"""

import re
from dataclasses import dataclass, field
from typing import Literal

from pydantic import ValidationError

from app import banco, rastro, relogio
from app.contratos import RelatoEstruturado, SinalDeAlarme
from app.cuidado import duvidas, orquestrador
from app.regras import urgencia

TipoDeEntrada = Literal["relato", "risco", "registro_acs", "tempo"]
TAMANHO_MAXIMO_DO_TEXTO = 1000

# Marcas de instrução embutida. O texto não é barrado: é marcado e segue como dado.
_INSTRUCAO_EMBUTIDA = (
    r"\bignor[ea] (as|todas as|suas) (instruc|regra)",
    r"\bdesconsider[ea] (as|todas as|suas) (instruc|regra)",
    r"\b(voce|vc) (agora )?e (um|uma) ",
    r"\b(system|sistema) ?prompt\b",
    r"\bnovas? instruc",
    r"\baprove (a|esta) proposta\b",
    r"\benvie (a|uma) mensagem\b",
    r"</?(dado|system|instruc)",
)


@dataclass
class Entrada:
    """Uma entrada validada pelo filtro (C04)."""

    tipo: TipoDeEntrada
    paciente_id: str
    relato: RelatoEstruturado | None = None
    texto: str = ""                       # texto de terceiros: dado, nunca instrução
    dados: dict = field(default_factory=dict)


@dataclass
class ResultadoDaEntrada:
    aceita: bool = True
    sinal: SinalDeAlarme | None = None    # atravessa a fronteira para a trilha de urgência
    duvida_id: str | None = None
    caso_id: str | None = None


def limpar_texto(texto: str) -> str:
    """Tira caracteres de controle e limita o tamanho do texto de terceiros."""
    sem_controle = "".join(c for c in texto if c.isprintable() or c in "\n\t")
    return re.sub(r"[ \t]+", " ", sem_controle).strip()[:TAMANHO_MAXIMO_DO_TEXTO]


def tem_instrucao_embutida(texto: str) -> bool:
    normal = urgencia.normalizar(texto)
    return any(re.search(padrao, normal) for padrao in _INSTRUCAO_EMBUTIDA)


def _filtrar(ctx: rastro.Contexto, tipo: TipoDeEntrada, bruto: dict) -> Entrada | None:
    """C04: valida o formato e isola o texto de terceiros como dado."""
    motivo = None
    relato = None
    texto = ""
    try:
        if tipo == "relato":
            relato = RelatoEstruturado.model_validate(bruto)
            if relato.paciente_id != ctx.paciente_id:
                motivo = "o relato é de outro paciente"
            relato.trecho_literal = limpar_texto(relato.trecho_literal)
            texto = relato.trecho_literal
        else:
            texto = limpar_texto(str(bruto.get("texto", "")))
    except ValidationError as erro:
        motivo = f"formato inválido ({erro.error_count()} campo(s))"
    if motivo is None and ctx.sessao.get(banco.Paciente, ctx.paciente_id) is None:
        motivo = "paciente desconhecido"
    if motivo is not None:
        ctx.evento("C04", "regra", entrada={"tipo": tipo}, saida={
            "valida": False, "resumo": f"Entrada recusada pelo filtro: {motivo}.",
        })
        return None
    suspeita = tem_instrucao_embutida(texto)
    ctx.evento("C04", "regra", entrada={"tipo": tipo, "texto": texto}, saida={
        "valida": True, "texto_isolado_como_dado": True, "instrucao_embutida": suspeita,
        "resumo": "Entrada validada. O texto traz uma instrução embutida e segue marcado como dado."
        if suspeita else "Entrada validada. O texto de terceiros segue isolado como dado.",
    })
    dados = {k: v for k, v in bruto.items() if k != "texto"} if tipo != "relato" else {}
    return Entrada(tipo=tipo, paciente_id=ctx.paciente_id, relato=relato, texto=texto, dados=dados)


def _checar_alarme(ctx: rastro.Contexto, entrada: Entrada) -> SinalDeAlarme | None:
    """C05: segunda checagem de alarme, só por regras."""
    disparo = urgencia.detectar(entrada.texto)
    if disparo is None:
        ctx.evento("C05", "regra", saida={
            "decisao": "não", "resumo": "Nenhum sinal de alarme nas regras.",
        })
        return None
    ctx.evento("C05", "regra", saida={
        "decisao": "sim", "regra": disparo.regra,
        "resumo": f"Sinal de alarme: {disparo.descricao}. Atravessa a fronteira para a trilha de urgência.",
    })
    return SinalDeAlarme(
        id=banco.novo_id("sin"), paciente_id=entrada.paciente_id, origem="cuidado",
        regra=disparo.regra, trecho_literal=entrada.texto[:280], criado_em=relogio.agora(),
    )


def receber(ctx: rastro.Contexto, tipo: TipoDeEntrada, bruto: dict) -> ResultadoDaEntrada:
    """Caminho único de entrada do Cuidado: C04, C05, C06 e, daí, C07 ou o orquestrador."""
    entrada = _filtrar(ctx, tipo, bruto)
    if entrada is None:
        return ResultadoDaEntrada(aceita=False)

    sinal = _checar_alarme(ctx, entrada)
    if sinal is not None:
        return ResultadoDaEntrada(sinal=sinal)

    # C06: é dúvida clínica? Usa o tipo definido pela Escuta.
    if entrada.relato is not None and entrada.relato.tipo == "duvida":
        ctx.evento("C06", "regra", saida={
            "decisao": "sim", "resumo": "Dúvida clínica: vai para a fila do profissional. Nenhum agente redige.",
        })
        duvida = duvidas.abrir(ctx, entrada.relato)
        return ResultadoDaEntrada(duvida_id=duvida.id)
    ctx.evento("C06", "regra", saida={"decisao": "não", "resumo": "Não é dúvida clínica."})

    return ResultadoDaEntrada(caso_id=orquestrador.tratar(ctx, entrada))


def receber_relato(ctx: rastro.Contexto, relato: dict) -> ResultadoDaEntrada:
    """E12 -> C04: relato estruturado vindo da Escuta, ainda serializado."""
    return receber(ctx, "relato", relato)
