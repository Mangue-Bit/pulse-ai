from fastapi.testclient import TestClient

from app.main import app
from dados import carga


def test_pacientes_trazem_microarea_acs_e_aceite(sessao):
    carga.carregar(sessao)
    pacientes = {p["id"]: p for p in TestClient(app).get("/api/pacientes").json()}
    assert pacientes["pac-01"]["aceite_valido"] is True
    assert pacientes["pac-04"]["aceite_valido"] is False
    assert pacientes["pac-08"]["aceite_valido"] is False
    assert pacientes["pac-01"]["microarea_nome"].startswith("Microárea 1")
    assert pacientes["pac-01"]["acs_nome"] == "Rosana Lima"


def test_equipe_tem_a_cadeia_de_alerta_e_os_acs(sessao):
    carga.carregar(sessao)
    papeis = [p["papel"] for p in TestClient(app).get("/api/equipe").json()]
    assert papeis[:3] == ["plantao", "enfermeiro", "gestor"]
    assert papeis.count("acs") == 3


def test_reiniciar_a_demonstracao_recria_os_dados(banco_limpo):
    cliente = TestClient(app)
    assert cliente.get("/api/pacientes").json() == []
    assert cliente.post("/api/demo/reiniciar").json() == {"status": "ok"}
    assert len(cliente.get("/api/pacientes").json()) >= 10
