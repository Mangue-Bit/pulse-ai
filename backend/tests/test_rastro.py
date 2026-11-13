import pytest
from fastapi.testclient import TestClient

from app import rastro
from app.main import app


def test_registrar_evento_grava_e_devolve_em_ordem(sessao):
    for etapa in ("E01", "E02", "E03"):
        rastro.registrar_evento(
            sessao, etapa=etapa, ator="regra", paciente_id="pac-1", caso_id="cas-1",
            entrada={"texto": "oi"}, saida={"ok": True},
        )
    eventos = rastro.eventos_do_caso(sessao, "cas-1")
    assert [e.etapa for e in eventos] == ["E01", "E02", "E03"]
    assert eventos[0].entrada == {"texto": "oi"}


def test_evento_guarda_metricas_da_chamada_ao_modelo(sessao):
    chamada = rastro.MetricasChamada(
        modelo="claude-opus-5-5", versao_prompt="interpretar_relato.v1",
        latencia_ms=812, tokens_entrada=420, tokens_saida=96, custo=0.0036,
    )
    evento = rastro.registrar_evento(
        sessao, etapa="E10", ator="modelo", paciente_id="pac-1", chamada=chamada,
    )
    assert evento.modelo == "claude-opus-5-5"
    assert evento.versao_prompt == "interpretar_relato.v1"
    assert (evento.latencia_ms, evento.tokens_entrada, evento.tokens_saida) == (812, 420, 96)
    assert evento.custo == pytest.approx(0.0036)


@pytest.mark.parametrize("etapa", ["X01", "E1", "c18", ""])
def test_etapa_fora_do_fluxo_e_recusada(sessao, etapa):
    with pytest.raises(ValueError):
        rastro.registrar_evento(sessao, etapa=etapa, ator="regra", paciente_id="pac-1")


def test_ator_desconhecido_e_recusado(sessao):
    with pytest.raises(ValueError):
        rastro.registrar_evento(sessao, etapa="E01", ator="agente", paciente_id="pac-1")


def test_vincular_caso_liga_as_etapas_anteriores_da_interacao(sessao):
    ctx = rastro.nova_interacao(sessao, "pac-1")
    ctx.evento("E01", "pessoa")
    ctx.evento("E12", "regra")
    outra = rastro.nova_interacao(sessao, "pac-1")
    outra.evento("E01", "pessoa")

    ctx.vincular_caso("cas-9")
    ctx.evento("C08", "regra")

    assert [e.etapa for e in rastro.eventos_do_caso(sessao, "cas-9")] == ["E01", "E12", "C08"]


def test_eventos_recentes_a_partir_de_um_marco(sessao):
    ctx = rastro.nova_interacao(sessao, "pac-1")
    primeiro = ctx.evento("E01", "pessoa")
    ctx.evento("E02", "regra")
    ctx.evento("E03", "regra")
    depois = rastro.eventos_recentes(sessao, paciente_id="pac-1", depois_de=primeiro.id)
    assert [e.etapa for e in depois] == ["E02", "E03"]
    assert [e.etapa for e in rastro.eventos_recentes(sessao, limite=2)] == ["E02", "E03"]


def test_rota_de_eventos_do_caso_devolve_em_ordem(sessao):
    for etapa in ("C08", "C10", "C12"):
        rastro.registrar_evento(sessao, etapa=etapa, ator="regra", paciente_id="pac-1", caso_id="cas-1")
    resposta = TestClient(app).get("/api/casos/cas-1/eventos")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert [e["etapa"] for e in corpo] == ["C08", "C10", "C12"]
    assert set(corpo[0]) >= {"id", "caso_id", "paciente_id", "interacao_id", "etapa", "ator", "criado_em"}
