"""Regras de urgência, compartilhadas pela Escuta (E03) e pelo Cuidado (C05).

A lista de sinais é fixa e roda antes de qualquer modelo. Na dúvida, a
resposta é sim: uma menção negada ("não estou com dor no peito") também
dispara, e quem avalia é uma pessoa da equipe.

A lista abaixo é de demonstração. Em uso real, ela é definida e revisada pela
equipe clínica da unidade.
"""

import re
import unicodedata
from dataclasses import dataclass


@dataclass(frozen=True)
class Sinal:
    regra: str
    descricao: str
    padroes: tuple[str, ...]


@dataclass(frozen=True)
class Disparo:
    regra: str
    descricao: str
    trecho: str


SINAIS: tuple[Sinal, ...] = (
    Sinal("dor_no_peito", "Dor ou aperto no peito", (
        r"\bdor(es)?( muito)?( forte| grande| horrivel)? (no|do|em|n[oa]) (meu )?peito\b",
        r"\b(aperto|pontada|queimacao|pressao) no (meu )?peito\b",
        r"\bpeito (ta |esta |tava |estava )?(doendo|apertando|apertado|queimando)\b",
    )),
    Sinal("falta_de_ar", "Falta de ar ou dificuldade para respirar", (
        r"\bfalta de ar\b",
        r"\bsem ar\b(?! condicionado)",
        r"\bnao (consigo|to conseguindo|estou conseguindo|consegue|ta conseguindo) respirar\b",
        r"\bdificuldade (de|pra|para) respirar\b",
        r"\b(sufocando|sufocado|sufocada)\b",
    )),
    Sinal("desmaio", "Desmaio ou perda de consciência", (
        r"\bdesmai(ei|ou|ando|ada|ado)\b",
        r"\bperd(i|eu) (os sentidos|a consciencia)\b",
        r"\b(cai|caiu) e nao (acordo|acorda|responde)\b",
    )),
    Sinal("sinais_de_derrame", "Sinais de derrame (AVC)", (
        r"\bboca (ta |esta |ficou )?torta\b",
        r"\b(rosto|cara) (ta |esta |ficou )?(torto|torta|caido|caida)\b",
        r"\bfala (ta |esta |ficou )?(enrolada|embolada|arrastada)\b",
        r"\bnao (consigo|consegue|to conseguindo) falar\b",
        r"\b(fraqueza|dormencia|formigamento) (de um|em um|num|dum|de so um) lado\b",
        r"\b(braco|perna|lado do corpo) (nao mexe|sem forca|paralisad[oa]|dormente)\b",
    )),
    Sinal("convulsao", "Convulsão", (
        r"\bconvuls",
        r"\bataque epileptico\b",
    )),
    Sinal("sangramento_intenso", "Sangramento intenso", (
        r"\bsangrando muito\b",
        r"\bmuito sangue\b",
        r"\bsangramento (forte|intenso|grande|que nao para)\b",
        r"\b(vomitando|vomitei|tossindo|tossi) sangue\b",
        r"\bhemorragia\b",
    )),
    Sinal("risco_de_autolesao", "Ideia de se machucar ou de tirar a própria vida", (
        r"\b(quero|queria|vou|vontade de) (morrer|me matar|sumir de vez)\b",
        r"\b(tirar|acabar com) (a )?minha (propria )?vida\b",
        r"\bnao quero mais viver\b",
        r"\bsuicid",
    )),
    Sinal("superdosagem", "Possível superdosagem de medicamento", (
        r"\btom(ei|ou) (a |uma )?(caixa|cartela) (toda|inteira)\b",
        r"\btom(ei|ou) (todos os|muitos|varios) (comprimidos|remedios) de uma vez\b",
        r"\btom(ei|ou) remedio demais\b",
    )),
    Sinal("reacao_alergica_grave", "Sinais de reação alérgica grave", (
        r"\bgarganta (ta |esta )?(fechando|fechou|fechada|inchada|inchando)\b",
        r"\b(lingua|labio|labios|rosto) (ta |esta |estao )?(inchad[oa]s?|inchando)\b",
    )),
    Sinal("confusao_aguda", "Confusão ou desorientação de início súbito", (
        r"\bnao (sei|sabe) onde (estou|esta)\b",
        r"\bdesorientad[oa]\b",
        r"\bnao (reconhece|ta reconhecendo|esta reconhecendo) (ninguem|a familia|as pessoas)\b",
    )),
)


def normalizar(texto: str) -> str:
    """Minúsculas, sem acentos e com espaços simples, para a comparação com as regras."""
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"\s+", " ", sem_acento).strip()


def detectar(texto: str) -> Disparo | None:
    """Devolve o primeiro sinal de urgência encontrado no texto, ou None."""
    normalizado = normalizar(texto)
    for sinal in SINAIS:
        for padrao in sinal.padroes:
            achado = re.search(padrao, normalizado)
            if achado:
                return Disparo(regra=sinal.regra, descricao=sinal.descricao, trecho=achado.group(0))
    return None
