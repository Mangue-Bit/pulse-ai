"""CUID-3: corpus, índice e recuperação com fonte (C12)."""

import pytest

from app import banco
from app.contratos import Fonte
from app.cuidado import rag


def test_corpus_vira_trechos_com_fonte():
    trechos, _ = rag.indice()
    assert len(trechos) >= 40
    ids = [t.fonte.id for t in trechos]
    assert len(ids) == len(set(ids)), "cada trecho tem um identificador único"
    for trecho in trechos:
        assert isinstance(trecho.fonte, Fonte)
        assert trecho.fonte.origem in {"bulario", "protocolo"}
        assert "sintétic" in trecho.fonte.titulo
        assert trecho.fonte.trecho and "#" in trecho.fonte.id


@pytest.mark.parametrize(("barreira", "esperado"), [
    ("analfabetismo", "protocolo-adesao#dificuldade-de-leitura"),
    ("muitos_medicamentos", "protocolo-adesao#muitos-medicamentos"),
    ("rede_de_apoio", "protocolo-adesao#falta-de-rede-de-apoio"),
    ("acesso_a_remedios", "protocolo-adesao#dificuldade-de-acesso-aos-medicamentos"),
    ("percepcao_de_melhora", "protocolo-adesao#percepcao-de-melhora"),
])
def test_busca_devolve_o_trecho_do_protocolo_da_barreira(barreira, esperado):
    fontes = rag.buscar_no_corpus(rag.CONSULTA_POR_BARREIRA[barreira])
    assert fontes[0].id == esperado
    assert len(fontes) <= rag.TRECHOS_DO_CORPUS


def test_medicamento_do_paciente_traz_a_bula_dele():
    fontes = rag.buscar_no_corpus("losartana potássica esquecer de usar")
    assert any(f.id.startswith("bula-losartana#") for f in fontes)
    assert all(f.origem == "bulario" for f in fontes if f.id.startswith("bula-"))


def test_consulta_sem_relacao_com_o_corpus_nao_devolve_nada():
    assert rag.buscar_no_corpus("xyzzy plugh") == []
    assert rag.buscar_no_corpus("") == []


def test_recuperar_junta_corpus_e_historico_do_paciente(dados):
    paciente = dados.get(banco.Paciente, "pac-01")
    fontes = rag.recuperar(dados, paciente, "analfabetismo", "não consigo ler a receita")
    origens = {f.origem for f in fontes}
    assert {"protocolo", "historico"} <= origens
    historico = [f for f in fontes if f.origem == "historico"]
    assert historico[0].id == "historico:rel-hist-01"
    assert "neta" in historico[0].trecho
    assert all(isinstance(f, Fonte) for f in fontes)


def test_historico_inclui_resultados_registrados(dados):
    fontes = rag.historico_do_paciente(dados, "pac-07")
    assert fontes and all(f.origem == "historico" for f in fontes)
    assert any("barreira não superada" in f.titulo for f in fontes)
    assert rag.historico_do_paciente(dados, "pac-12") == []
