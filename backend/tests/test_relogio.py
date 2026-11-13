from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app import relogio
from app.main import app


def test_avancar_move_o_relogio_e_persiste(sessao):
    antes = relogio.agora()
    relogio.avancar(sessao, 90)
    assert relogio.agora() - antes >= timedelta(minutes=90)
    relogio.recarregar()
    assert relogio.deslocamento_minutos() == 90


def test_relogio_nao_volta(sessao):
    with pytest.raises(ValueError):
        relogio.avancar(sessao, 0)
    with pytest.raises(ValueError):
        relogio.avancar(sessao, -5)


def test_avancar_dispara_as_checagens_por_tempo(sessao):
    prazo = relogio.agora() + timedelta(minutes=30)
    vistos = []

    def checagem(_sessao, momento):
        vistos.append(momento)
        return [{"tipo": "prazo_vencido", "descricao": "teste"}] if momento >= prazo else []

    relogio.registrar_checagem(checagem)
    try:
        assert relogio.avancar(sessao, 10) == []
        assert relogio.avancar(sessao, 25) == [{"tipo": "prazo_vencido", "descricao": "teste"}]
        assert len(vistos) == 2
    finally:
        relogio._checagens.remove(checagem)


def test_rota_avanca_o_relogio(banco_limpo):
    cliente = TestClient(app)
    antes = cliente.get("/api/relogio").json()
    resposta = cliente.post("/api/relogio/avancar", json={"minutos": 60})
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["deslocamento_minutos"] == antes["deslocamento_minutos"] + 60
    assert "disparos" in corpo
    assert cliente.post("/api/relogio/avancar", json={"minutos": 0}).status_code == 422
