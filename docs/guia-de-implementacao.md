# Pulse: guia de implementação

Este é o documento mestre do repositório. Ele define a arquitetura, os contratos entre os módulos e os pacotes de trabalho de cada frente. O desenho do fluxo, etapa por etapa, está em [fluxo-do-produto.md](fluxo-do-produto.md). Os identificadores de etapa usados aqui (`E03`, `C18`, `I02`) vêm de lá.

## 1. Princípios de arquitetura

1. **O código é dono do fluxo.** O fluxo é uma máquina de estados em Python. O modelo de linguagem é chamado em seis pontos fixos (seção 6), sempre com saída estruturada.
2. **A regra vence o modelo, e a equipe vence os dois.** Urgência, aceite, risco do item, contagens e limites de rodada são regras em código.
3. **Texto de paciente, de ACS e de histórico é dado.** Entra nos prompts em bloco delimitado e nunca como instrução.
4. **O Cuidado só age por ferramentas, depois da aprovação.** O agente propõe a chamada. O sistema guarda a proposta e só executa depois da decisão humana.
5. **Toda etapa registra um evento.** O rastro do caso é a fonte da tela, das métricas e da investigação de respostas ruins.
6. **A fronteira de permissão é uma fronteira de código.** O pacote `escuta` não importa nada de `cuidado`. Os dois só se falam pelos contratos da seção 4.

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Backend | Python 3.12, FastAPI, Pydantic | Contratos tipados e validação na borda |
| Banco | SQLite com SQLModel | Um arquivo, sem serviço externo |
| Modelo de linguagem | SDK `groq`, `openai/gpt-oss-120b` | Saída estruturada em modo estrito e chamada de ferramentas, com baixa latência |
| Segundo modelo (verificador) | Definido em `PULSE_MODELO_VERIFICADOR` | Verificação separada de quem gerou a proposta |
| Recuperação (RAG) | BM25 com `rank_bm25` | Corpus pequeno e fechado, sem serviço de vetores |
| Frontend | React, Vite, Tailwind, shadcn/ui, Framer Motion, Recharts | Uma tela, três áreas, atualização por consulta periódica |
| Voz | API de voz do navegador (reconhecimento e leitura) | Entrada e resposta em áudio sem serviço externo |
| Testes | pytest | Regras e contratos |

## 3. Estrutura do repositório

```
backend/
  app/
    main.py              # aplicação FastAPI e rotas
    config.py            # configuração lida do ambiente
    contratos.py         # esquemas da seção 4
    banco.py             # tabelas e sessão
    relogio.py           # relógio do sistema (pode ser avançado)
    rastro.py            # registrar_evento()
    modelo.py            # cliente único do modelo de linguagem
    modelo_simulado.py   # cliente simulado, usado sem chave e nos testes
    regras/              # urgência, catálogo, risco do item, limites
    escuta/              # E01 a E13
    urgencia/            # U01 a U05
    cuidado/
      orquestrador.py    # C08 a C16
      rag.py             # C12
      especialistas/     # intervencao.py, relatorio.py, territorio.py
      verificador.py     # C18, C19
      aprovacao.py       # C07, C20 a C27
      ferramentas.py     # C28 a C30
      desfecho.py        # C31 a C39
      aprendizado.py     # C40 a C42
    prompts/             # um arquivo por ponto de chamada, com versão
  dados/
    catalogo.json        # itens de intervenção
    corpus/              # bulas e protocolos
    carga.py             # dados sintéticos
  avaliacao/
    casos.jsonl          # teste fixo
    rodar.py
  tests/
frontend/
  src/
    areas/               # paciente, equipe, rastro
    componentes/
    api.ts
docs/
```

## 4. Contratos

Os quatro primeiros são os únicos objetos que atravessam a fronteira de permissão.

```python
Barreira = Literal[
    "muitos_medicamentos", "analfabetismo", "rede_de_apoio",
    "acesso_a_remedios", "percepcao_de_melhora", "nao_identificada",
]

class RelatoEstruturado(BaseModel):      # Escuta -> Cuidado (E12 -> C04)
    id: str
    paciente_id: str
    tipo: Literal["relato", "duvida"]
    barreira: Barreira | None
    lembrete: str | None
    trecho_literal: str                  # dado, nunca instrução
    certeza: float                       # 0 a 1
    criado_em: datetime

class SinalDeAlarme(BaseModel):          # Escuta ou Cuidado -> urgência (E03, C05 -> U01)
    id: str
    paciente_id: str
    origem: Literal["escuta", "cuidado"]
    regra: str                           # regra que disparou, ou "modelo"
    trecho_literal: str
    criado_em: datetime

class DuvidaVencida(BaseModel):          # fila do profissional -> urgência (C07 -> U02)
    id: str
    paciente_id: str
    relato_id: str
    prazo: datetime
    vencida_em: datetime

class MensagemAprovada(BaseModel):       # Cuidado -> paciente (C28 -> E13)
    id: str
    proposta_id: str
    paciente_id: str
    canal: Literal["texto", "audio"]
    texto: str
    aprovada_por: str
    aprovada_em: datetime
    chave_unica: str
```

Objetos internos do Cuidado:

```python
class EstadoDoCaso(BaseModel):           # C09
    caso_id: str
    paciente_id: str
    microarea_id: str
    status: Literal["aberto", "aguardando_aprovacao", "aguardando_resultado",
                    "resolvido", "busca_ativa", "suspenso"]
    situacao_paciente: Literal["ativo", "em_urgencia", "internado", "aceite_revogado"]
    rodada: int
    pendencias: list[str]
    validade: datetime | None

class Fonte(BaseModel):
    id: str                              # trecho do corpus ou registro do histórico
    origem: Literal["bulario", "protocolo", "historico"]
    titulo: str
    trecho: str

class Proposta(BaseModel):               # saída dos especialistas, C16 em diante
    id: str
    caso_id: str
    especialista: Literal["intervencao", "relatorio", "territorio"]
    item_catalogo_id: str | None
    ferramenta: str
    argumentos: dict
    justificativa: str
    fontes: list[Fonte]
    risco: Literal["baixo", "alto"]      # vem do catálogo
    estado: Literal["pendente", "aprovada", "editada", "recusada",
                    "expirada", "cancelada", "executada", "falhou"]
    verificacao: dict | None             # resultado de C18
    validade: datetime

class ItemCatalogo(BaseModel):
    id: str
    nome: str
    barreiras: list[Barreira]
    ferramenta: str
    risco: Literal["baixo", "alto"]
    exige_aceite: bool
    canal_preferido: Literal["texto", "audio", "presencial"]
    modelo_de_mensagem: str | None
    taxa_sucesso: float | None
    amostra: int

class Evento(BaseModel):                 # rastro
    id: str
    caso_id: str | None
    paciente_id: str
    interacao_id: str | None             # liga as etapas de uma mesma entrada antes de existir caso
    etapa: str                           # identificador do fluxo, por exemplo "C18"
    ator: Literal["regra", "modelo", "pessoa", "ferramenta"]
    entrada: dict
    saida: dict
    modelo: str | None
    versao_prompt: str | None
    latencia_ms: int | None
    tokens_entrada: int | None
    tokens_saida: int | None
    custo: float | None
    criado_em: datetime
```

`certeza` e `taxa_sucesso` ficam entre 0 e 1, e `rodada` começa em 1. `MensagemAprovada` não aceita `texto`, `aprovada_por` nem `chave_unica` vazios.

O `interacao_id` do evento identifica uma entrada (uma mensagem do paciente, um registro do ACS ou um avanço do relógio). As etapas da Escuta acontecem antes de existir caso; quando o orquestrador abre ou retoma o caso (C08), os eventos daquela interação recebem o `caso_id`. Assim o rastro do caso mostra a cadeia inteira, da mensagem ao resultado.

Mudança em contrato é combinada entre as duas frentes antes de ser feita.

## 5. Dados

Tabelas: `paciente`, `aceite`, `microarea`, `acs`, `conversa`, `relato`, `caso`, `proposta`, `execucao`, `tarefa_acs`, `relatorio`, `alerta`, `duvida`, `resultado`, `evento`, `lista_territorio`, `relogio`.

- `lista_territorio` guarda a lista priorizada de cada microárea, gravada pela ferramenta `atualizar_lista`.
- `relogio` guarda o deslocamento do relógio do sistema em relação ao relógio real.

- `execucao` tem restrição de unicidade em `chave_unica`. É isso que impede o envio duplicado.
- `conversa` tem `expira_em`. A conversa bruta expira antes do histórico.
- `aceite` guarda `registrado_em` e `revogado_em`.
- Todos os dados são sintéticos e gerados por `backend/dados/carga.py`.

## 6. Pontos de chamada ao modelo

Todas as chamadas passam por `app/modelo.py`, que aplica a saída estruturada, registra versão do prompt, latência, tokens e custo, e trata erro e recusa.

| Nº | Etapas | Entrada | Saída estruturada | Modelo |
|---|---|---|---|---|
| 1 | E03, E06, E08, E10 | Texto normalizado, em bloco de dado | `urgencia`, `entendivel`, `duvida_clinica`, `tipo`, `barreira`, `trecho_literal`, `certeza`, `lembrete` | `PULSE_MODELO`, esforço baixo |
| 2 | C13, C15 | Estado do caso, tipo de entrada, contexto | `especialistas[]`, `informacao_faltante` | `PULSE_MODELO` |
| 3 | I03 | Fator de risco, itens permitidos, contexto | Chamada de uma das quatro ferramentas, com `item_catalogo_id`, `justificativa` e `fontes` | `PULSE_MODELO` |
| 4 | R02, R03 | Registro do ACS, relatórios anteriores, trechos com fonte | `frases[]`, cada uma com `texto` e `fonte_id` | `PULSE_MODELO` |
| 5 | T02 | Quadro por microárea calculado pelas regras | `prioridades[]`, cada uma com `paciente_id`, `posicao` e `motivo` | `PULSE_MODELO` |
| 6 | C18 | Proposta consolidada e fontes | `aprovada`, `motivos[]` | `PULSE_MODELO_VERIFICADOR` |

Regras de uso:

- **Regras rodam antes do modelo.** Em E03, se a regra de urgência dispara, o caso vai para U01 sem consultar o modelo. Se a regra não dispara e o modelo indica urgência, também vai. Na dúvida, sim.
- **Saída estruturada:** `client.chat.completions.create(model=..., messages=..., response_format={"type": "json_schema", "json_schema": {"name": ..., "strict": True, "schema": ...}})`. No modo estrito a Groq restringe a geração ao esquema: todo objeto leva `additionalProperties: false`, todos os campos são obrigatórios e campo opcional é união com nulo. O esquema sai do modelo Pydantic do ponto de chamada, e a resposta é validada de novo por ele. Barreira e item do catálogo são enumerações: o modelo não consegue inventar um valor fora da lista. O esforço de raciocínio de cada ponto vai em `reasoning_effort`.
- **Chamada de ferramenta (ponto 3):** as ferramentas são declaradas em `tools`, com `tool_choice="auto"`. Na Groq, a saída estruturada e as ferramentas não se combinam na mesma chamada, então o ponto 3 usa só ferramentas, e o código valida os argumentos devolvidos. O `tool_calls` devolvido vira uma `Proposta` e não é executado. Se o modelo não chamar ferramenta, o caso segue para C17 (tarefa manual).
- **Recusa e erro:** o cliente confere `finish_reason` antes de ler o conteúdo. Filtro de conteúdo, saída cortada, erro de rede, erro da API ou saída fora do esquema nunca viram resposta ao paciente: o caso segue para o caminho humano (E07 na Escuta, C17 no Cuidado).
- **Cliente simulado:** sem `GROQ_API_KEY`, ou com `PULSE_MODELO_SIMULADO=1`, `app/modelo.py` usa `app/modelo_simulado.py`, que responde por heurísticas determinísticas no mesmo esquema de saída. Os eventos gravados assim levam o modelo `simulado-local`, e a tela mostra o selo "modelo simulado".
- **Frase sem fonte não entra:** depois do ponto 4, o código descarta toda frase cujo `fonte_id` não esteja entre os trechos recuperados.
- **Prompts versionados:** um arquivo por ponto em `app/prompts/`, com a versão no nome (`interpretar_relato.v1.md`). A versão vai para o evento.

A resposta ao paciente (E11) não usa modelo: o código escolhe o modelo de resposta aprovado pela barreira identificada.

## 7. Ferramentas

| Ferramenta | Argumentos | Efeito |
|---|---|---|
| `enviar_mensagem` | `paciente_id`, `modelo_de_mensagem`, `variaveis`, `canal` | Entrega a mensagem aprovada ao paciente (E13) |
| `criar_tarefa_acs` | `paciente_id`, `acs_id`, `tipo`, `descricao`, `prazo` | Cria tarefa na lista do ACS |
| `salvar_relatorio` | `paciente_id`, `frases[]` com `texto` e `fonte_id` | Salva o relatório no histórico |
| `atualizar_lista` | `microarea_id`, `itens[]` com `paciente_id`, `posicao` e `motivo` | Atualiza a lista priorizada do território |

Execução (C26 a C30):

1. Antes de executar, o código relê o estado do caso, o aceite e a validade da proposta.
2. A chave única é derivada de `proposta_id` e do nome da ferramenta. A gravação em `execucao` falha se a chave já existir.
3. Em caso de falha, até 3 tentativas com a mesma chave. Depois o item vira tarefa manual.

## 8. API

| Método e rota | Uso |
|---|---|
| `POST /api/mensagens` | Mensagem do paciente (entra na Escuta) |
| `GET /api/conversas/{paciente_id}` | Conversa do paciente |
| `POST /api/aceite` · `DELETE /api/aceite/{paciente_id}` | Registra ou revoga o aceite |
| `POST /api/acs/registros` | Input do ACS |
| `POST /api/relogio/avancar` | Avança o relógio do sistema e dispara as checagens por tempo |
| `GET /api/alertas` · `POST /api/alertas/{id}/confirmar` | Trilha de urgência |
| `GET /api/duvidas` · `POST /api/duvidas/{id}/responder` | Fila do profissional |
| `GET /api/propostas` · `POST /api/propostas/{id}/aprovar` · `/editar` · `/recusar` | Fila de aprovação |
| `GET /api/casos` · `GET /api/casos/{id}` | Casos e estado |
| `POST /api/casos/{id}/resultado` | Registro do resultado pelo ACS |
| `GET /api/casos/{id}/eventos` | Rastro do caso |
| `GET /api/territorio/{microarea_id}` · `GET /api/gestor/resumo` | Visão do ACS e visão agregada do gestor |
| `GET /api/metricas` | Indicadores de observabilidade |
| `GET /api/saude` | Verificação do serviço |

## 9. Interface

Uma tela com três áreas e uma barra superior.

| Área | Conteúdo |
|---|---|
| Barra superior | Relógio do sistema com botão de avançar, seletor de paciente, indicadores resumidos |
| Paciente (esquerda) | Chat no formato de celular: texto e áudio, estado do aceite, botão de revogar |
| Equipe (centro) | Abas: Alertas, Dúvidas, Aprovações, Casos, ACS, Território, Relatórios, Gestor |
| Rastro (direita) | Linha do tempo do caso com as etapas acendendo. Segunda aba: mapa completo do fluxo com o caminho percorrido. Terceira aba: indicadores |

- As cores seguem o fluxograma: azul para a Escuta, vermelho para a urgência, roxo para o Cuidado, laranja para decisões da equipe, verde para o concluído.
- A tela lê o rastro pelo identificador de etapa. Qualquer etapa que registre evento aparece na linha do tempo e no mapa sem código extra.
- **Reprodução de rastro:** a tela consegue reexibir os eventos gravados de um caso. Serve para investigar uma resposta ruim e para desenvolver a interface sem depender do backend.
- Tema claro, fonte grande e leitura confortável em 1366×768.

## 10. Rastro, métricas e avaliação

- `registrar_evento()` é chamado por toda etapa, inclusive as que são só regra ou decisão humana.
- Indicadores calculados sobre a tabela `evento`: taxa de aprovação sem edição, taxa de reprovação do verificador, falsos positivos de urgência, dúvidas vencidas que viraram alerta, latência e custo por caso.
- **Teste fixo** (`backend/avaliacao/`): mensagens sintéticas rotuladas, incluindo urgências, dúvidas clínicas, relatos de cada barreira, mensagens ambíguas e tentativas de injeção de instrução. Mede urgências detectadas e acerto da barreira. O resultado aparece na aba de indicadores.

## 11. Frentes e pacotes de trabalho

O trabalho se divide em três grupos. A Base é feita em conjunto. A Frente A cuida da borda com o paciente e da segurança. A Frente B cuida do núcleo de cuidado.

### Base (em conjunto)

| Pacote | Entrega | Pronto quando |
|---|---|---|
| BASE-1 | Esqueleto do repositório: backend, frontend, `.env.example`, comando único para subir | `GET /api/saude` responde e a tela abre |
| BASE-2 | Contratos e banco | Os esquemas da seção 4 e as tabelas da seção 5 existem e têm teste de validação |
| BASE-3 | Rastro | `registrar_evento()` grava e `GET /api/casos/{id}/eventos` devolve em ordem |
| BASE-4 | Cliente do modelo | Uma chamada com saída estruturada grava versão, latência, tokens e custo, e trata recusa e erro |
| BASE-5 | Dados sintéticos | A carga cria pacientes, microáreas, ACS, catálogo, histórico e casos em todos os estados |
| BASE-6 | Casca da interface | As três áreas e todas as abas existem e funcionam com reprodução de rastro |
| BASE-7 | Relógio do sistema | Avançar o relógio dispara prazos e checagens por tempo |

### Frente A: Escuta, urgência e segurança

| Pacote | Etapas | Entrega | Pronto quando | Depende de |
|---|---|---|---|---|
| SEG-1 | E03, C05 | Regras de urgência, compartilhadas pela Escuta e pelo Cuidado | A lista de sinais tem testes com casos positivos e negativos | BASE-2 |
| SEG-2 | E04 a E09 | Portões da Escuta: aceite, clareza e dúvida clínica, com as mensagens fixas | Cada portão tem um teste e registra evento | BASE-3 |
| SEG-3 | E03, E06, E08, E10 | Ponto de chamada 1: triagem e interpretação do relato | Um relato vira `RelatoEstruturado` com barreira do catálogo e trecho literal | BASE-4 |
| SEG-4 | E11, E12 | Resposta por modelo aprovado e registro do relato | O paciente recebe a resposta e o relato chega ao filtro de entrada | SEG-3 |
| SEG-5 | U01 a U05, C07 | Trilha de urgência e fila do profissional com prazo | A cadeia de alerta avança com o relógio; dúvida vencida vira alerta; sem confirmação vira pendência crítica | SEG-1, BASE-7 |
| SEG-6 | C04, C05 | Filtro de entrada e segunda checagem de alarme | Texto com instrução embutida passa como dado e não altera o comportamento | SEG-1 |
| SEG-7 | C18, C19 | Verificador independente, com uma nova tentativa | Proposta com conduta clínica, sem fonte ou fora do catálogo é reprovada com motivo | BASE-4 |
| SEG-8 | E02, E04, E13 | Memória e privacidade: sessão, revogação do aceite, expiração da conversa | Revogar o aceite cancela as propostas pendentes e bloqueia novos envios | BASE-2 |
| SEG-9 | Seção 10 | Teste fixo e indicadores | `rodar.py` imprime urgências detectadas e acerto da barreira; `GET /api/metricas` responde | SEG-3, BASE-3 |
| SEG-10 | E01, E02, E13 | Tela: chat do paciente, em texto e áudio | Conversa completa pela tela, com entrada por voz e leitura em voz | BASE-6, SEG-4 |
| SEG-11 | Seção 9 | Tela: rastro ao vivo, mapa do fluxo, indicadores, abas Alertas e Dúvidas | As etapas acendem conforme os eventos chegam | BASE-6, BASE-3 |

### Frente B: Cuidado

| Pacote | Etapas | Entrega | Pronto quando | Depende de |
|---|---|---|---|---|
| CUID-1 | C08 a C11 | Estado do caso e orquestrador | Um relato abre ou retoma o caso; paciente não ativo suspende a fila | BASE-2, BASE-3 |
| CUID-2 | C01 a C03 | Entradas: risco de abandono, input do ACS e checagem por tempo | As três entradas chegam ao filtro pelo mesmo caminho | CUID-1, BASE-7 |
| CUID-3 | C12 a C14 | RAG: corpus, índice e recuperação com fonte | A busca devolve trechos com `Fonte`; lacuna de informação gera pedido ao ACS | BASE-5 |
| CUID-4 | C15 a C17 | Ponto de chamada 2: delegação, e consolidação das saídas | Cada tipo de entrada chega ao especialista certo; sem item aplicável vira tarefa manual | CUID-1, BASE-4 |
| CUID-5 | I01 a I03 | Agente de Intervenção: filtro por regra e ponto de chamada 3 | A proposta usa só item permitido e aponta a ferramenta | CUID-3, CUID-4 |
| CUID-6 | R01 a R03 | Agente de Relatório: ponto de chamada 4 | Toda frase do relatório tem fonte; frase sem fonte é descartada | CUID-3, CUID-4 |
| CUID-7 | T01 a T03 | Agente de Território: contagens por regra e ponto de chamada 5 | Lista nominal para o ACS e visão agregada, sem nomes, para o gestor | CUID-4 |
| CUID-8 | C20 a C27 | Fila de aprovação: risco do item, aprovar, editar, recusar, expirar, revalidar | Uma proposta percorre todos os desfechos possíveis da fila | CUID-5 |
| CUID-9 | C28 a C30 | Ferramentas e execução com chave única e novas tentativas | Executar duas vezes a mesma proposta gera um único envio | CUID-8 |
| CUID-10 | C31 a C39 | Desfecho: resultado, rodadas, encerramento e busca ativa | O registro do ACS encerra o caso, abre nova rodada ou leva à busca ativa | CUID-9 |
| CUID-11 | C40 a C42 | Ciclo de aprendizado | O resultado atualiza a taxa de sucesso e reordena o catálogo, respeitando a amostra mínima | CUID-10 |
| CUID-12 | Seção 9 | Tela: abas Aprovações, Casos, ACS, Território, Relatórios e Gestor | A equipe aprova, edita e recusa pela tela; o ACS registra resultado | BASE-6, CUID-8 |

## 12. Convenções

- **Ramos:** `main` sempre sobe. Cada pacote entra por um ramo curto com o nome do pacote (`seg-3-interpretacao`).
- **Commits:** pequenos, em português, começando pelo pacote (`SEG-3: interpreta o relato com saída estruturada`).
- **Segredos:** só em `.env`, que não é versionado. O `.env.example` lista as variáveis: `GROQ_API_KEY`, `PULSE_MODELO`, `PULSE_MODELO_VERIFICADOR`, `PULSE_BANCO`, `PULSE_MODELO_SIMULADO`.
- **Dados:** apenas sintéticos. Nenhum dado real de paciente entra no repositório.
- **Nomes:** os termos do código seguem os do fluxo (relato, barreira, proposta, aceite, rodada).
- **Testes:** toda regra de segurança (urgência, aceite, filtro, chave única) tem teste antes de ser ligada ao fluxo.
