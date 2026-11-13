from fastapi.testclient import TestClient

from app.escuta import mensagens
from app.main import app

RELATO_DA_DEMO = "não tô tomando o remédio da pressão, não consigo ler a receita"


def test_conversa_completa_pela_api(dados, cliente_simulado):
    cliente = TestClient(app)
    resposta = cliente.post("/api/mensagens", json={"paciente_id": "pac-01", "texto": RELATO_DA_DEMO})
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["desfecho"] == "relato" and corpo["interacao_id"].startswith("int-")
    assert [m["texto"] for m in corpo["mensagens"]] == [mensagens.RESPOSTA_POR_BARREIRA["analfabetismo"]]

    conversa = cliente.get("/api/conversas/pac-01").json()
    assert conversa["aceite_valido"] is True
    assert [m["autor"] for m in conversa["mensagens"]] == ["paciente", "pulse"]
    assert set(conversa["mensagens"][0]) == {"id", "autor", "canal", "texto", "tipo", "etapa", "criado_em"}

    etapas = [e["etapa"] for e in cliente.get("/api/eventos", params={"paciente_id": "pac-01"}).json()]
    assert etapas[:10] == ["E01", "E02", "E03", "E03", "E04", "E06", "E08", "E10", "E11", "E12"]


def test_mensagem_para_paciente_inexistente_ou_longa_demais(dados):
    cliente = TestClient(app)
    assert cliente.post("/api/mensagens", json={"paciente_id": "pac-99", "texto": "oi"}).status_code == 404
    assert cliente.post("/api/mensagens", json={"paciente_id": "pac-01", "texto": "a" * 2001}).status_code == 422
    assert cliente.post("/api/mensagens", json={"paciente_id": "pac-01", "texto": "oi", "canal": "sms"}).status_code == 422
    assert cliente.get("/api/conversas/pac-99").status_code == 404


def test_registrar_aceite_libera_a_conversa(dados, cliente_simulado):
    cliente = TestClient(app)
    antes = cliente.post("/api/mensagens", json={"paciente_id": "pac-04", "texto": RELATO_DA_DEMO}).json()
    assert antes["desfecho"] == "pedido_de_aceite"
    assert cliente.post("/api/aceite", json={"paciente_id": "pac-04"}).json()["aceite_valido"] is True
    depois = cliente.post("/api/mensagens", json={"paciente_id": "pac-04", "texto": RELATO_DA_DEMO}).json()
    assert depois["desfecho"] == "relato"
