# Pulse AI

Protótipo de acompanhamento da adesão ao tratamento na atenção primária, com conversa do paciente, área da equipe e rastreabilidade das decisões. O backend usa FastAPI e SQLite; a interface usa React, TypeScript e Vite.

Os pacientes e registros da demonstração são fictícios. O projeto é um protótipo para demonstração e desenvolvimento, sem autenticação para uso em produção.

## Executar localmente

Requisitos: Python 3.11 ou superior e Node.js 24 com npm.

```sh
git clone https://github.com/Mangue-Bit/pulse-ai.git
cd pulse-ai
```

Copie `.env.example` para `.env`. Para testar sem credenciais, deixe `GROQ_API_KEY` vazia: o sistema usa o modelo simulado. Para usar a Groq, configure a chave apenas no `.env` local.

```sh
python iniciar.py
```

O comando prepara as dependências e os dados sintéticos, inicia a API e a interface e mostra os endereços no terminal. As portas preferidas são 8000 e 5173. Encerre com `Ctrl+C`.

## Verificações

Com o ambiente preparado, execute na raiz:

```sh
# Windows
.venv/Scripts/python.exe -m pytest -q backend

# Linux e macOS
.venv/bin/python -m pytest -q backend

# Interface
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run lint
```

Os testes do backend usam um banco temporário e o modelo simulado.

## Organização

- `backend/app`: API, contratos, regras, Escuta, Cuidado e trilha de urgência.
- `backend/dados`: carga sintética e corpus de referência.
- `backend/tests`: testes automatizados.
- `frontend/src`: áreas do paciente, equipe e rastro.
- [Fluxo do produto](docs/fluxo-do-produto.md).
- [Guia de implementação](docs/guia-de-implementacao.md).

## Contribuição e segurança

Crie branches `feat/`, `fix/`, `docs/` ou `chore/`, use Conventional Commits e integre primeiro em `development`. Após validação, promova `development` para `main`.

Não versione chaves, `.env`, bancos SQLite, dados reais de pacientes, dependências instaladas ou anotações de `_local/`. O `.env.example` contém somente configurações de exemplo e campos de credenciais vazios.
