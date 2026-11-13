import re
from typing import get_args

from sqlmodel import select

from app import banco, contratos
from app.config import PASTA_DADOS
from app.regras.catalogo import FERRAMENTAS, carregar_catalogo
from dados import carga


def test_catalogo_e_valido_e_cobre_todas_as_barreiras():
    itens = carregar_catalogo()
    assert len(itens) >= 5
    cobertas = {barreira for item in itens for barreira in item.barreiras}
    assert cobertas >= set(contratos.BARREIRAS) - {"nao_identificada"}
    for item in itens:
        assert item.ferramenta in FERRAMENTAS
        assert item.modelo_de_mensagem
        campos = set(re.findall(r"\{(\w+)\}", item.modelo_de_mensagem))
        assert campos <= {"nome", "acs"}
        if item.ferramenta == "enviar_mensagem":
            assert item.exige_aceite, "mensagem só sai com aceite"


def test_corpus_e_marcado_como_sintetico_e_tem_origem():
    arquivos = sorted((PASTA_DADOS / "corpus").glob("*.md"))
    assert len(arquivos) >= 7
    origens = set()
    for arquivo in arquivos:
        texto = arquivo.read_text(encoding="utf-8")
        cabecalho = re.match(r"---\n(.*?)\n---\n", texto, flags=re.DOTALL)
        assert cabecalho, arquivo.name
        campos = dict(linha.split(": ", 1) for linha in cabecalho.group(1).splitlines())
        assert campos["id"] == arquivo.stem
        assert campos["origem"] in {"bulario", "protocolo"}
        assert "sintétic" in campos["titulo"]
        assert "Conteúdo sintético" in texto
        origens.add(campos["origem"])
    assert origens == {"bulario", "protocolo"}


def test_carga_cria_todos_os_tipos_de_registro(sessao):
    totais = carga.carregar(sessao)
    assert totais["microareas"] == 3 and totais["acs"] == 3
    assert totais["pacientes"] >= 10
    assert totais["relatorios"] >= 1 and totais["resultados"] >= 1 and totais["tarefas"] >= 1
    assert totais["eventos"] == totais["casos"]


def test_carga_cria_casos_em_todos_os_estados(sessao):
    carga.carregar(sessao)
    status = {caso.status for caso in sessao.exec(select(banco.Caso)).all()}
    assert status == set(get_args(contratos.StatusCaso))
    situacoes = {p.situacao for p in sessao.exec(select(banco.Paciente)).all()}
    assert {"ativo", "internado", "aceite_revogado"} <= situacoes
    estados = {p.estado for p in sessao.exec(select(banco.Proposta)).all()}
    assert {"pendente", "executada", "recusada", "cancelada"} <= estados


def test_propostas_da_carga_respeitam_o_contrato(sessao):
    carga.carregar(sessao)
    for proposta in sessao.exec(select(banco.Proposta)).all():
        contratos.Proposta.model_validate(proposta.model_dump())


def test_carga_pode_ser_repetida(sessao):
    primeira = carga.carregar(sessao)
    segunda = carga.carregar(sessao)
    assert primeira == segunda
