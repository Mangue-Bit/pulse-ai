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
    from app import banco

    banco.apagar_tudo()
    yield
    banco.apagar_tudo()


@pytest.fixture()
def sessao(banco_limpo):
    from app import banco

    with banco.sessao() as s:
        yield s
