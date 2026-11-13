"""Equipe de saúde da unidade na demonstração. Nomes fictícios."""

from sqlmodel import Session, select

from app import banco

# Ordem da cadeia de alerta da trilha de urgência (U02): um nível por vez.
CADEIA_DE_ALERTA = ("plantao", "enfermeiro", "gestor")

PROFISSIONAIS = (
    {"id": "prof-plantao", "nome": "Júlio Ramos (técnico de plantão)", "papel": "plantao", "microarea_id": None},
    {"id": "prof-enfermeira", "nome": "Marina Duarte (enfermeira)", "papel": "enfermeiro", "microarea_id": None},
    {"id": "prof-gestora", "nome": "Carla Mendes (gerente da unidade)", "papel": "gestor", "microarea_id": None},
)


def listar(sessao: Session) -> list[dict]:
    agentes = sessao.exec(select(banco.Acs).order_by(banco.Acs.id)).all()
    return [
        *PROFISSIONAIS,
        *(
            {"id": a.id, "nome": f"{a.nome} (ACS)", "papel": "acs", "microarea_id": a.microarea_id}
            for a in agentes
        ),
    ]
