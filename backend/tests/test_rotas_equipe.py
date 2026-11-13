from fastapi.testclient import TestClient

from app.main import app

RELATO_DA_DEMO = "não tô tomando o remédio da pressão, não consigo ler a receita"
PROFISSIONAL = "prof-enfermeira"


def _proposta_pendente_do_relato(cliente: TestClient) -> dict:
    cliente.post("/api/mensagens", json={"paciente_id": "pac-01", "texto": RELATO_DA_DEMO})
    pendentes = [p for p in cliente.get("/api/propostas", params={"estado": "pendente"}).json()
                 if p["paciente_id"] == "pac-01"]
    assert pendentes, "o relato da demonstração deveria gerar uma proposta pendente"
    return pendentes[0]


def test_cenario_1_relato_vira_proposta_e_a_equipe_aprova(dados, cliente_simulado):
    cliente = TestClient(app)
    proposta = _proposta_pendente_do_relato(cliente)
    assert proposta["barreira"] == "analfabetismo"
    assert proposta["trecho_literal"] and proposta["resumo"]

    aprovada = cliente.post(f"/api/propostas/{proposta['id']}/aprovar", json={"profissional": PROFISSIONAL})
    assert aprovada.status_code == 200
    assert aprovada.json()["estado"] in ("aprovada", "executada")
    assert aprovada.json()["decidida_por"] == PROFISSIONAL

    repetida = cliente.post(f"/api/propostas/{proposta['id']}/aprovar", json={"profissional": PROFISSIONAL})
    assert repetida.status_code == 409

    detalhe = cliente.get(f"/api/casos/{proposta['caso_id']}").json()
    assert detalhe["paciente_nome"] == "Maria das Dores Silva"
    assert any(p["id"] == proposta["id"] for p in detalhe["propostas"])
    assert detalhe["relatos"] and detalhe["relatos"][0]["trecho_literal"]

    metricas = cliente.get("/api/metricas").json()
    assert metricas["aprovacao"]["aprovadas"] >= 1


def test_recusar_exige_justificativa_e_devolve_o_caso(dados, cliente_simulado):
    cliente = TestClient(app)
    proposta = _proposta_pendente_do_relato(cliente)
    url = f"/api/propostas/{proposta['id']}/recusar"
    assert cliente.post(url, json={"profissional": PROFISSIONAL, "justificativa": ""}).status_code == 422
    recusada = cliente.post(url, json={"profissional": PROFISSIONAL, "justificativa": "Prefiro a visita do ACS."})
    assert recusada.json()["estado"] == "recusada"
    caso = cliente.get(f"/api/casos/{proposta['caso_id']}").json()
    assert caso["status"] == "aberto"


def test_cenario_2_alerta_e_confirmado_e_encerrado(dados, cliente_simulado):
    cliente = TestClient(app)
    cliente.post("/api/mensagens", json={"paciente_id": "pac-02", "texto": "tô com dor no peito e falta de ar"})
    alertas = cliente.get("/api/alertas").json()
    alerta = next(a for a in alertas if a["paciente_id"] == "pac-02")
    assert alerta["status"] == "aberto" and alerta["paciente_nome"]

    url = f"/api/alertas/{alerta['id']}"
    assert cliente.post(f"{url}/encerrar", json={"profissional": PROFISSIONAL}).status_code == 409
    assert cliente.post(f"{url}/confirmar", json={"profissional": PROFISSIONAL}).json()["status"] == "confirmado"
    encerrado = cliente.post(f"{url}/encerrar", json={"profissional": PROFISSIONAL, "falso_positivo": True})
    assert encerrado.json()["status"] == "encerrado"
    assert cliente.get("/api/metricas").json()["urgencia"]["falsos_positivos"] == 1
    assert cliente.post("/api/alertas/alt-nao-existe/confirmar", json={"profissional": PROFISSIONAL}).status_code == 404


def test_cenario_3_duvida_respondida_chega_ao_paciente(dados, cliente_simulado):
    cliente = TestClient(app)
    cliente.post("/api/mensagens", json={"paciente_id": "pac-03", "texto": "posso tomar dois comprimidos?"})
    duvida = next(d for d in cliente.get("/api/duvidas").json() if d["paciente_id"] == "pac-03")
    assert duvida["status"] == "aberta"

    url = f"/api/duvidas/{duvida['id']}/responder"
    resposta = "Tome só um comprimido por dia, como está na receita."
    respondida = cliente.post(url, json={"profissional": PROFISSIONAL, "resposta": resposta})
    assert respondida.json()["status"] == "respondida"
    assert cliente.post(url, json={"profissional": PROFISSIONAL, "resposta": resposta}).status_code == 409

    conversa = cliente.get("/api/conversas/pac-03").json()["mensagens"]
    assert any(m["texto"] == resposta and m["autor"] == "equipe" for m in conversa)


def test_revogar_aceite_cancela_pendentes(dados, cliente_simulado):
    cliente = TestClient(app)
    _proposta_pendente_do_relato(cliente)
    revogado = cliente.delete("/api/aceite/pac-01").json()
    assert revogado["aceite_valido"] is False and revogado["propostas_canceladas"] >= 1
    assert not [p for p in cliente.get("/api/propostas", params={"estado": "pendente"}).json()
                if p["paciente_id"] == "pac-01"]
    assert cliente.delete("/api/aceite/pac-99").status_code == 404


def test_visoes_da_equipe_respondem(dados):
    cliente = TestClient(app)
    casos = cliente.get("/api/casos").json()
    assert casos and {"caso_id", "paciente_nome", "status", "barreira"} <= set(casos[0])
    assert cliente.get("/api/casos/cas-nao-existe").status_code == 404

    territorio = cliente.get("/api/territorio/ma-01").json()
    assert territorio["microarea_id"] == "ma-01" and territorio["acs"]
    assert cliente.get("/api/territorio/ma-99").status_code == 404

    assert isinstance(cliente.get("/api/relatorios").json(), list)

    gestor = cliente.get("/api/gestor/resumo").json()
    assert gestor["totais"]["pacientes"] == 12
    assert "paciente_nome" not in str(gestor)

    metricas = cliente.get("/api/metricas").json()
    assert set(metricas) >= {"aprovacao", "verificador", "urgencia", "operacao", "por_prompt", "modelo_de_risco"}


def test_registro_do_acs_e_resultado_do_caso(dados, cliente_simulado):
    cliente = TestClient(app)
    registro = cliente.post("/api/acs/registros", json={
        "paciente_id": "pac-10", "acs_id": "acs-01", "tipo": "visita",
        "texto": "Paciente diz que esquece os remédios quando a filha viaja.",
    })
    assert registro.status_code == 200 and registro.json()["interacao_id"]

    aguardando = next((c for c in cliente.get("/api/casos").json() if c["status"] == "aguardando_resultado"), None)
    if aguardando is not None:
        url = f"/api/casos/{aguardando['caso_id']}/resultado"
        corpo = {"acs_id": "acs-01", "barreira_resolvida": True, "observacao": "Organizou a caixa de remédios."}
        assert cliente.post(url, json=corpo).status_code == 200
        assert cliente.post(url, json=corpo).status_code == 409
