"""Sobe o Pulse com um comando: python iniciar.py

Cria o ambiente virtual e instala as dependências na primeira execução,
gera os dados sintéticos se o banco não existir e inicia o backend e a
interface. As portas preferidas são 8000 e 5173; se estiverem ocupadas, o
script usa as próximas livres e informa o endereço no terminal.
"""

import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
BACKEND = RAIZ / "backend"
FRONTEND = RAIZ / "frontend"
VENV = RAIZ / ".venv"
PYTHON_VENV = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def executar(comando: list[str], pasta: Path) -> None:
    subprocess.run(comando, cwd=pasta, check=True)


def preparar_python() -> None:
    if not PYTHON_VENV.exists():
        print("[pulse] criando o ambiente virtual em .venv")
        executar([sys.executable, "-m", "venv", str(VENV)], RAIZ)
    marcador = VENV / ".dependencias-instaladas"
    requisitos = BACKEND / "requirements.txt"
    if not marcador.exists() or marcador.stat().st_mtime < requisitos.stat().st_mtime:
        print("[pulse] instalando as dependências do backend")
        executar([str(PYTHON_VENV), "-m", "pip", "install", "-q", "-r", str(requisitos)], RAIZ)
        marcador.touch()


def preparar_frontend(npm: str) -> None:
    if not (FRONTEND / "node_modules").exists():
        print("[pulse] instalando as dependências da interface")
        executar([npm, "install", "--no-audit", "--no-fund"], FRONTEND)


def preparar_dados() -> None:
    carga = BACKEND / "dados" / "carga.py"
    if carga.exists():
        executar([str(PYTHON_VENV), "-m", "dados.carga", "--se-vazio"], BACKEND)


def porta_livre(preferida: int) -> int:
    for porta in range(preferida, preferida + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s4:
            try:
                s4.bind(("127.0.0.1", porta))
            except OSError:
                continue
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as s6:
            try:
                s6.bind(("::1", porta))
            except OSError:
                continue
        return porta
    raise RuntimeError(f"nenhuma porta livre a partir de {preferida}")


def main() -> int:
    npm = shutil.which("npm")
    if npm is None:
        print("[pulse] npm não encontrado. Instale o Node.js 20 ou superior.")
        return 1
    preparar_python()
    preparar_frontend(npm)
    preparar_dados()

    porta_api = porta_livre(int(os.environ.get("PULSE_PORTA_API", "8000")))
    porta_tela = porta_livre(int(os.environ.get("PULSE_PORTA_TELA", "5173")))
    ambiente = {**os.environ, "PULSE_PORTA_API": str(porta_api)}
    print(f"[pulse] backend em http://localhost:{porta_api}")
    print(f"[pulse] interface em http://localhost:{porta_tela}")
    processos = [
        subprocess.Popen(
            [str(PYTHON_VENV), "-m", "uvicorn", "app.main:app", "--port", str(porta_api)],
            cwd=BACKEND,
            env=ambiente,
        ),
        subprocess.Popen(
            [npm, "run", "dev", "--", "--port", str(porta_tela), "--strictPort"],
            cwd=FRONTEND,
            env=ambiente,
        ),
    ]
    try:
        while all(p.poll() is None for p in processos):
            try:
                processos[0].wait(timeout=1)
            except subprocess.TimeoutExpired:
                pass
    except KeyboardInterrupt:
        print("\n[pulse] encerrando")
    finally:
        for p in processos:
            if p.poll() is None:
                p.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
