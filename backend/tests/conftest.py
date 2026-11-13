import os
import tempfile
from pathlib import Path

import pytest

_pasta = Path(tempfile.mkdtemp(prefix="pulse-testes-"))
os.environ["PULSE_BANCO"] = str(_pasta / "pulse-testes.db")
os.environ["PULSE_MODELO_SIMULADO"] = "1"


@pytest.fixture()
def banco_limpo():
    """Banco vazio, com todas as tabelas, para cada teste."""
    from app import banco, relogio

    banco.apagar_tudo()
    relogio.recarregar()
    yield
    banco.apagar_tudo()
    relogio.recarregar()


@pytest.fixture()
def sessao(banco_limpo):
    from app import banco

    with banco.sessao() as s:
        yield s


@pytest.fixture()
def dados(sessao):
    """Banco com os dados sintéticos da demonstração."""
    from dados import carga

    carga.carregar(sessao)
    return sessao


@pytest.fixture()
def cliente_simulado():
    """Cliente de modelo simulado, com o registro das chamadas feitas."""
    from app import modelo
    from app.modelo_simulado import ClienteSimulado

    cliente = ClienteSimulado()
    modelo.usar_cliente(cliente)
    yield cliente
    modelo.usar_cliente(None)


class ClienteQueFalha:
    """Cliente de modelo que devolve a falha escolhida pelo teste."""

    def __init__(self, motivo_parada=None, erro=None):
        self.motivo_parada, self.erro = motivo_parada, erro
        self.chamadas = 0

    def estruturado(self, **_):
        from app.modelo import RespostaBruta

        self.chamadas += 1
        if self.erro:
            raise self.erro
        return RespostaBruta(motivo_parada=self.motivo_parada, modelo="claude-opus-5-5")

    com_ferramentas = estruturado


@pytest.fixture()
def modelo_que_falha():
    """Fábrica: instala um cliente que recusa, erra ou corta a saída."""
    from app import modelo

    def instalar(motivo_parada=None, erro=None):
        cliente = ClienteQueFalha(motivo_parada, erro)
        modelo.usar_cliente(cliente)
        return cliente

    yield instalar
    modelo.usar_cliente(None)
