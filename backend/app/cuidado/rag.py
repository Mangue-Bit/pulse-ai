"""C12: recuperação de contexto (RAG) no bulário, nos protocolos e no histórico.

Corpus pequeno e fechado, indexado com BM25. Cada trecho recuperado guarda a
fonte; é por ela que o código descarta, depois, toda frase sem fonte.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from rank_bm25 import BM25Okapi
from sqlmodel import Session, col, select

from app import banco
from app.config import PASTA_DADOS
from app.contratos import Fonte

PASTA_CORPUS = PASTA_DADOS / "corpus"
TRECHOS_DO_CORPUS = 4
REGISTROS_DO_HISTORICO = 3

# Termos de busca de cada barreira. São escritos no código: o modelo não participa da busca.
CONSULTA_POR_BARREIRA = {
    "analfabetismo": "dificuldade de leitura ler receita embalagens orientação falada áudio apoio visual desenhos",
    "muitos_medicamentos": "muitos medicamentos vários horários confunde quadro simples organização das caixas",
    "rede_de_apoio": "rede de apoio mora só familiar vizinho cuidador acompanha de perto",
    "acesso_a_remedios": "acesso medicamento falta receita vencida farmácia retirada distância custo",
    "percepcao_de_melhora": "percepção de melhora interrompe tratamento sentir bem uso contínuo conversa",
    "nao_identificada": "adesão ao tratamento dificuldade barreira equipe",
}

_PALAVRAS_VAZIAS = {
    "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "em", "no", "na", "nos", "nas", "um",
    "uma", "que", "com", "por", "para", "pra", "se", "ou", "ao", "aos", "como", "mais", "este", "esta",
    "esse", "essa", "seu", "sua", "nao", "eu", "me", "ta", "to", "é", "eh",
}


@dataclass(frozen=True)
class Trecho:
    fonte: Fonte
    termos: tuple[str, ...]


def termos(texto: str) -> list[str]:
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    return [t for t in re.findall(r"[a-z0-9]+", sem_acento) if len(t) > 1 and t not in _PALAVRAS_VAZIAS]


def _identificador(titulo: str) -> str:
    return "-".join(termos_brutos(titulo))


def termos_brutos(texto: str) -> list[str]:
    sem_acento = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower()) if unicodedata.category(c) != "Mn"
    )
    return re.findall(r"[a-z0-9]+", sem_acento)


def ler_documento(caminho: Path) -> list[Fonte]:
    """Divide um arquivo do corpus em trechos, um por seção, cada um com a sua fonte."""
    texto = caminho.read_text(encoding="utf-8")
    cabecalho = re.match(r"---\n(.*?)\n---\n", texto, flags=re.DOTALL)
    if cabecalho is None:
        raise ValueError(f"arquivo do corpus sem cabeçalho: {caminho.name}")
    campos = dict(linha.split(": ", 1) for linha in cabecalho.group(1).splitlines())
    corpo = texto[cabecalho.end():]
    fontes = []
    for secao in re.split(r"^## ", corpo, flags=re.MULTILINE)[1:]:
        titulo, _, conteudo = secao.partition("\n")
        conteudo = re.sub(r"\s+", " ", conteudo).strip()
        if conteudo:
            fontes.append(Fonte(
                id=f"{campos['id']}#{_identificador(titulo)}",
                origem=campos["origem"],
                titulo=f"{campos['titulo']} · {titulo.strip()}",
                trecho=conteudo,
            ))
    return fontes


@lru_cache(maxsize=1)
def indice() -> tuple[tuple[Trecho, ...], BM25Okapi]:
    trechos = tuple(
        Trecho(fonte=fonte, termos=tuple(termos(f"{fonte.titulo} {fonte.trecho}")))
        for caminho in sorted(PASTA_CORPUS.glob("*.md"))
        for fonte in ler_documento(caminho)
    )
    if not trechos:
        raise ValueError("corpus vazio")
    return trechos, BM25Okapi([list(t.termos) for t in trechos])


def buscar_no_corpus(consulta: str, quantidade: int = TRECHOS_DO_CORPUS) -> list[Fonte]:
    """Os trechos mais relevantes do bulário e dos protocolos para a consulta."""
    trechos, bm25 = indice()
    pontos = bm25.get_scores(termos(consulta))
    ordem = sorted(range(len(trechos)), key=lambda i: pontos[i], reverse=True)
    return [trechos[i].fonte for i in ordem[:quantidade] if pontos[i] > 0]


def historico_do_paciente(s: Session, paciente_id: str, quantidade: int = REGISTROS_DO_HISTORICO) -> list[Fonte]:
    """Relatórios e resultados anteriores do paciente, como fontes de origem 'historico'."""
    fontes: list[Fonte] = []
    relatorios = s.exec(
        select(banco.Relatorio).where(banco.Relatorio.paciente_id == paciente_id)
        .order_by(col(banco.Relatorio.criado_em).desc())
    ).all()
    for relatorio in relatorios[:quantidade]:
        texto = " ".join(frase["texto"] for frase in relatorio.frases)
        if texto:
            fontes.append(Fonte(
                id=f"historico:{relatorio.id}", origem="historico",
                titulo=f"Relatório do paciente de {relatorio.criado_em:%d/%m/%Y}", trecho=texto,
            ))
    casos = [c.id for c in s.exec(select(banco.Caso).where(banco.Caso.paciente_id == paciente_id)).all()]
    if casos:
        resultados = s.exec(
            select(banco.Resultado).where(col(banco.Resultado.caso_id).in_(casos))
            .order_by(col(banco.Resultado.criado_em).desc())
        ).all()
        for resultado in resultados[:quantidade]:
            situacao = "barreira superada" if resultado.barreira_resolvida else "barreira não superada"
            fontes.append(Fonte(
                id=f"historico:{resultado.id}", origem="historico",
                titulo=f"Resultado registrado pelo ACS em {resultado.criado_em:%d/%m/%Y} ({situacao})",
                trecho=resultado.observacao or situacao,
            ))
    return fontes[:quantidade]


def recuperar(s: Session, paciente: banco.Paciente, barreira: str | None, texto_livre: str = "") -> list[Fonte]:
    """C12: contexto do caso, com fonte em cada trecho.

    A consulta junta os termos fixos da barreira, os medicamentos do paciente e o
    texto do relato ou do registro. O texto de terceiros só alimenta a busca.
    """
    consulta = " ".join([
        CONSULTA_POR_BARREIRA.get(barreira or "nao_identificada", ""),
        " ".join(paciente.medicamentos),
        texto_livre,
    ])
    return [*buscar_no_corpus(consulta), *historico_do_paciente(s, paciente.id)]
