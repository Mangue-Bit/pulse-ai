# Pulse: fluxo do produto

Este documento descreve o desenho completo do fluxo do Pulse, etapa por etapa: o que cada uma recebe (entrada), o que faz (lógica) e o que entrega (saída). É a versão em texto do fluxograma "Pulse v3: fluxograma com orquestrador e especialistas".

O Pulse tem dois agentes separados por uma fronteira de permissão, mais uma trilha de urgência em que nenhum agente decide:

- **Agente de Escuta:** conversa com o paciente. Lembra só da sessão. Não age sobre o cuidado.
- **Trilha de urgência:** regras fixas e pessoas.
- **Agente de Cuidado:** um orquestrador, três agentes especialistas e um verificador, apoiados por um estado do caso compartilhado. Só age por ferramentas, depois da aprovação da equipe de saúde.

## Como ler

- Cada etapa tem um identificador estável (`E` Escuta, `U` urgência, `C` Cuidado, `I` Intervenção, `R` Relatório, `T` Território). O mesmo identificador aparece no rastro de cada caso e no código.
- Etapas cujo nome termina em "?" são decisões. A coluna Saída mostra para onde vai cada resposta.
- "Saída lateral" é uma etapa que encerra aquele caminho sem seguir o fluxo principal.
- A coluna Mód. indica o módulo do curso AKCIT que a etapa aplica (lista na seção 9).

## 1. Agente de Escuta

Limites do agente: **não pode** ver a carteira de pacientes, criar tarefa nem escrever texto clínico livre.

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| E01 | Mensagem do paciente | Texto ou áudio enviado pelo paciente no WhatsApp (chat web na demonstração) | Ponto de entrada da conversa | Mensagem bruta → E02 | |
| E02 | Normaliza a entrada | Mensagem bruta | Áudio vira texto. O original fica guardado | Texto normalizado → E03 | |
| E03 | Sinal de urgência? | Texto normalizado | Regras e modelo avaliam juntos. Na dúvida, a resposta é sim | sim → U01 (trilha de urgência) · não → E04 | 6 |
| E04 | Aceite válido? | Paciente identificado | Confere se o aceite está registrado e não foi revogado | sim → E06 · não → E05 | 7 |
| E05 | Pede o aceite | Paciente sem aceite válido | Envia mensagem fixa. Sem aceite, o agente só orienta e avisa o ACS | Saída lateral: pedido de aceite ao paciente e aviso ao ACS | |
| E06 | Deu para entender? | Texto normalizado | Avalia formato, assunto e certeza | sim → E08 · não → E07 | 6 |
| E07 | Pede esclarecimento | Mensagem que não deu para entender | Envia mensagem fixa. Na segunda vez, o caso vai para a equipe | Saída lateral: pedido de esclarecimento ou encaminhamento à equipe | |
| E08 | Dúvida clínica? | Texto compreendido | Classifica se é dúvida clínica. O agente nunca responde esse tipo de pergunta | sim → E09 · não → E10 | |
| E09 | Mensagem fixa | Dúvida clínica | Informa que um profissional responde dentro do prazo | Mensagem fixa ao paciente → E12 (registro com tipo "dúvida") | |
| E10 | Interpreta o relato | Texto compreendido, que não é dúvida clínica | Produz saída estruturada em esquema fixo: barreira do catálogo, trecho literal e certeza | Relato interpretado → E11 | 1 |
| E11 | Responde ao paciente | Relato interpretado | Responde só com modelo de resposta aprovado, em texto ou áudio. Pedido de lembrete é apenas anotado | Resposta ao paciente → E12 | 1 |
| E12 | Registra o relato estruturado | Relato interpretado ou dúvida | Grava paciente, tipo (relato ou dúvida), barreira, lembrete, data e certeza. O trecho literal fica marcado como dado | Relato estruturado → C04 (atravessa a fronteira de permissão) | |
| E13 | Paciente recebe a mensagem | Mensagem aprovada, vinda de C28 | Entrega em texto ou áudio no WhatsApp, só com aceite válido e depois da aprovação da equipe | Mensagem entregue ao paciente | 7 |

## 2. Trilha de urgência

Regras fixas e pessoas. Nenhum agente decide aqui. Quem entra fica com o estado "em urgência" e a fila automática do paciente é suspensa.

A trilha tem três portas de entrada: o sinal de urgência da Escuta (E03), o sinal de alarme do Cuidado (C05) e a dúvida clínica que venceu o prazo sem resposta (C07, que entra direto em U02).

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| U01 | Mensagem fixa de emergência | Sinal de urgência (E03) ou de alarme (C05) | Envia na hora: ligue 192 ou vá à UPA. Fora do horário, avisa que a unidade está fechada | Mensagem fixa ao paciente → U02 | 6 |
| U02 | Alerta a equipe, um nível por vez | Urgência aberta, ou dúvida vencida (C07) | Avisa o plantão, depois o enfermeiro, depois o gestor. Cada nível tem prazo para confirmar | Alerta ao nível atual → U03 | 6 |
| U03 | Alguém confirmou? | Alerta enviado | Aguarda a confirmação até o fim da cadeia | sim → U05 · não → U04 | |
| U04 | Pendência crítica | Cadeia esgotada sem confirmação | Reforça 192/UPA ao paciente, põe o caso no topo da fila do próximo turno e marca visita prioritária do ACS | Saída lateral: pendência crítica registrada | |
| U05 | Profissional assume o caso | Confirmação de um profissional | Contato humano com o paciente. Tudo fica registrado no histórico | Caso sob responsabilidade do profissional | |

## 3. Agente de Cuidado

### 3.1 Entradas e triagem

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C01 | Alto risco de abandono | Dados do paciente | Modelo de aprendizado de máquina convencional, usado só em versão validada | Paciente sinalizado → C04 | |
| C02 | Input do ACS | Registro do agente comunitário de saúde | Visita, contato ou observação | Registro → C04 | |
| C03 | Checagem por tempo | Relógio do sistema | Dispara por prazo vencido ou para o relatório semanal | Gatilho → C04 | |
| C04 | Filtro de entrada | Relato estruturado (E12), C01, C02 ou C03 | Valida o formato. Texto do paciente, do ACS e do histórico entra isolado como dado, nunca como instrução | Entrada validada → C05 | 6 |
| C05 | Algum sinal de alarme? | Entrada validada | Segunda checagem, só por regras | sim → U01 (trilha de urgência) · não → C06 | 6 |
| C06 | É dúvida clínica? | Entrada validada | Usa o tipo definido pela Escuta | sim → C07 · não → C08 | |
| C07 | Fila do profissional, com prazo | Dúvida clínica | Resposta humana. Nenhum agente redige. O paciente já recebeu a mensagem fixa (E09) | Resposta do profissional. Se o prazo vencer sem resposta → U02 | |

### 3.2 Orquestração e contexto

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C08 | Orquestrador abre ou retoma o caso | Entrada que não é alarme nem dúvida clínica | Identifica o paciente e a microárea. Lê e grava o estado do caso | Caso aberto ou retomado → C10 | 4 |
| C09 | Estado do caso | Leituras e gravações do orquestrador | Guarda status, rodada, pendências e validade. Guarda a situação do paciente: ativo, em urgência, internado ou aceite revogado | Estado compartilhado por todas as etapas | 4 |
| C10 | Paciente ativo? | Estado do caso | Confere se não há urgência nem internação | sim → C12 · não → C11 | 7 |
| C11 | Suspende a fila do paciente | Paciente não ativo | Cancela as propostas pendentes. Retoma quando o estado mudar | Saída lateral: fila suspensa | |
| C12 | Recupera o contexto (RAG) | Caso ativo | Busca no bulário, nos protocolos e no histórico do paciente. Cada trecho guarda a fonte | Contexto com fontes → C13 | 2 |
| C13 | Há informação suficiente? | Contexto recuperado | Avalia se dá para seguir com o que há | sim → C15 · não → C14 | |
| C14 | Diz o que falta | Lacuna de informação | Pede o dado ao ACS. A resposta volta como input do ACS (C02) | Saída lateral: pedido ao ACS | |
| C15 | Orquestrador delega | Caso com contexto suficiente | Escolhe o especialista: paciente em risco ou relato → Intervenção; registro do ACS → Relatório; checagem por tempo ou pedido → Território | Tarefa para I01, R01 ou T01 | 5 |

### 3.3 Agente de Intervenção

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| I01 | Lê o fator de risco | Caso delegado e contexto | Identifica o fator: muitos medicamentos, analfabetismo, rede de apoio, acesso a remédios ou percepção de melhora | Fator de risco → I02 | 5 |
| I02 | Regras filtram o catálogo | Fator de risco e estado do paciente | Regras fixas. Sem aceite: só ações presenciais do ACS, que pede o aceite na visita. Analfabetismo: prefere áudio | Itens permitidos → I03 | 7 |
| I03 | Escolhe a intervenção | Itens permitidos | Escolhe só entre os itens permitidos. A ordem segue a taxa de sucesso, com amostra mínima | Intervenção proposta → C16 | 5 |

### 3.4 Agente de Relatório

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| R01 | Junta registro e histórico | Registro do ACS | Reúne o registro com os relatórios anteriores | Material reunido → R02 | 5 |
| R02 | Redige o relatório | Material reunido | Escreve o que mudou e o que ficou pendente | Rascunho → R03 | 5 |
| R03 | Cita a fonte de cada frase | Rascunho | Liga cada frase à sua fonte. Frase sem fonte não entra | Relatório com fontes → C16 | 2 |

### 3.5 Agente de Território

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| T01 | Regras agrupam (sem IA) | Carteira de pacientes | Agrupa por microárea. Calcula contagens, prazos, pendências e risco do modelo de abandono | Quadro por microárea → T02 | 5 |
| T02 | Prioriza e sugere por microárea | Quadro por microárea | Ordena e explica o motivo de cada prioridade, sem escore clínico | Lista priorizada → T03 | 5 |
| T03 | Monta as duas visões | Lista priorizada | Visão do ACS: lista nominal priorizada. Visão do gestor: agregada na consulta, sem nomes | Duas visões → C16 | 5 |

### 3.6 Consolidação e verificação

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C16 | Orquestrador consolida | Saídas dos especialistas | Junta as saídas num caso só. Em conflito, a regra vence o modelo e a equipe vence os dois | Proposta consolidada → C18. Se nada no catálogo resolve → C17 | 5 |
| C17 | Sem item ou ferramenta | Caso sem item aplicável | Nada no catálogo resolve: vira tarefa manual da equipe | Saída lateral: tarefa manual | 3 |
| C18 | Verificador independente | Proposta consolidada | Regras e um segundo modelo conferem: sem conduta clínica? Tem fonte? Está no catálogo? | sim → C20 · não → C19 | 6 |
| C19 | Refaz uma vez | Proposta reprovada | Refaz a proposta uma vez. Se falhar de novo, devolve à equipe sem proposta, com o motivo | Nova proposta → C18, ou saída lateral: devolução à equipe | |

### 3.7 Aprovação pela equipe de saúde

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C20 | Qual o risco do item? | Proposta verificada | O risco vem do catálogo, por regra | baixo → C21 · alto → C22 | |
| C21 | Baixo risco: fila em lote | Lembretes, modelos fixos e relatórios | Aprovação em lote. Uma amostra é auditada toda semana | Proposta na fila em lote → C23 | |
| C22 | Alto risco: aprovação individual | Intervenção, texto novo ou encaminhamento | Aprovação item a item, com o trecho literal e as fontes à vista | Proposta na fila individual → C23 | |
| C23 | Equipe de saúde aprova a proposta? | Proposta na fila | Decisão humana | aprova ou edita → C26 · recusa → C24 · sem resposta → C25 | |
| C24 | Encerrado | Recusa | Registra a justificativa | Saída lateral: proposta encerrada | |
| C25 | Lembra e escalona | Proposta sem resposta | Avisa o responsável. A proposta expira no fim da validade | Saída lateral: lembrete, escalonamento ou expiração | |
| C26 | Ainda vale executar? | Proposta aprovada ou editada | Relê o estado do caso, o aceite e a validade | sim → C28 · não → C27 | 7 |
| C27 | Cancela e registra | Proposta que não vale mais | Cancela por paciente suspenso, aceite revogado ou proposta vencida | Saída lateral: cancelamento registrado | |

### 3.8 Execução por ferramentas

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C28 | Ferramentas executam (function calling) | Proposta aprovada e ainda válida | Quatro funções: `enviar_mensagem`, `criar_tarefa_acs`, `salvar_relatorio`, `atualizar_lista`. Cada item do catálogo aponta para uma ferramenta. Uma chave única evita duplicar | Execução → C29. A mensagem aprovada atravessa a fronteira → E13 | 3 |
| C29 | Execução confirmada? | Retorno da ferramenta | Confere se a ação foi feita | sim → C31, C32 ou C33 · não → C30 | |
| C30 | Mostra a falha | Execução não confirmada | Nova tentativa sem duplicar, até 3. Depois vira tarefa manual | Nova tentativa → C28, ou tarefa manual | |
| C31 | Intervenção feita | Execução confirmada | Mensagem em texto ou áudio, ACS acionado, UBS ou remarcação | Ação registrada → C34 | |
| C32 | Relatório do paciente | Execução confirmada | Salvo no histórico | Relatório salvo → C34 | |
| C33 | Relatório do território | Execução confirmada | ACS: lista nominal priorizada. Gestor: números por microárea, sem nomes | Listas atualizadas → C34 | |

### 3.9 Desfecho e rodadas

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C34 | Resultado registrado? | Ação executada | Aguarda o registro do resultado dentro do prazo | sim → C36 · não → C35 | |
| C35 | Sem registro | Prazo vencido sem resultado | Lembra o ACS uma vez. Se persistir, marca "sem registro", que não conta como falha | Saída lateral: caso marcado "sem registro" | |
| C36 | Barreira resolvida? | Resultado registrado | Confere se a barreira foi superada | sim → C37 · não → C38 | |
| C37 | Caso encerrado: resolvido | Barreira resolvida | O caso sai da fila. O resultado fica no histórico | Caso encerrado → C40 | |
| C38 | Atingiu o limite? | Barreira não resolvida | Limite de rodadas: 2 para alto risco, 3 para os demais | sim → C39 · não → nova rodada pela checagem por tempo (C03) | |
| C39 | Busca ativa presencial | Limite atingido | Visita do ACS e reunião de equipe. O caso sai do fluxo automático | Caso em busca ativa → C40 | |

### 3.10 Ciclo de aprendizado

| ID | Etapa | Entrada | Lógica | Saída | Mód. |
|---|---|---|---|---|---|
| C40 | Ciclo de aprendizado | Resultados, recusas e edições | Tudo vira dado. Marca quem recebeu intervenção, para o re-treino não confundir abandono evitado com baixo risco. O catálogo é ordenado por taxa de sucesso, só com amostra mínima | Dados de aprendizado e catálogo reordenado → C41 | 8 |
| C41 | Modelo novo validado? | Versão candidata do modelo de risco | Passa pelo teste fixo antes de ser promovida | sim → versão promovida re-treina o modelo de risco (C01), com reversão possível · não → C42 | 8 |
| C42 | Mantém a versão atual | Versão candidata reprovada | Mantém a versão em uso e registra o motivo | Saída lateral: decisão registrada | |

## 4. Fronteira de permissão

A Escuta e a trilha de urgência ficam de um lado. O Cuidado fica do outro. Só quatro coisas atravessam a fronteira:

| O que atravessa | De | Para | Por onde |
|---|---|---|---|
| Relato estruturado | Escuta (E12) | Cuidado (C04) | Filtro de entrada |
| Sinal de alarme | Cuidado (C05) | Trilha de urgência (U01) | Checagem por regras |
| Dúvida sem resposta no prazo | Cuidado (C07) | Trilha de urgência (U02) | Vencimento do prazo |
| Mensagem aprovada pela equipe | Cuidado (C28) | Paciente (E13) | Ferramenta `enviar_mensagem` |

## 5. Regras que valem no fluxo inteiro

1. Sem aceite, nenhuma mensagem sai. A única exceção é a mensagem fixa de emergência.
2. Dúvida clínica nunca é respondida por agente: vai para a fila do profissional, com prazo.
3. Bula: só o texto da bula, nunca dose ou troca de medicamento.
4. Texto de paciente, de ACS e de histórico é dado, nunca instrução.
5. Risco e intervenções vêm do catálogo, nunca do modelo.
6. Contagens vêm das regras, nunca do modelo.
7. Em conflito, a regra vence o modelo e a equipe vence os dois.
8. Paciente em urgência, internado ou sem aceite suspende a fila.
9. A visão do gestor é agregada na consulta, sem nomes.
10. Referências normativas: norma do CFM, regulamento da Anvisa e LGPD.
11. A demonstração usa dados sintéticos.

## 6. Memória, dados e privacidade

| Tema | Regra |
|---|---|
| Memória curta, na Escuta | A conversa em andamento. Expira ao fim da sessão |
| Memória longa, no Cuidado | Estado do caso, barreiras, histórico e o que já funcionou |
| Retenção | Prazo por tipo de dado. A conversa bruta expira antes do histórico |
| Revogação do aceite | Para os envios, cancela as pendências e anonimiza o que não precisa ficar |
| Áudio | Transcrito na entrada. O original segue o prazo da conversa |
| Base legal | Confirmar com o encarregado de dados se o consentimento é a melhor base |

## 7. Observabilidade e avaliação

Um identificador por caso liga todas as etapas. É por ele que a equipe investiga uma resposta ruim. O rastro de um caso segue esta cadeia:

`mensagem → relato estruturado → contexto recuperado → versão do prompt e do modelo → saída do agente → verificação → aprovação ou edição → execução → resultado`

| Indicador | O que mede |
|---|---|
| Teste fixo, com dados sintéticos | Urgências reais detectadas. Acerto da barreira classificada |
| Sinal de degradação | Queda na aprovação sem edição. Alta na reprovação do verificador |
| Fadiga de alerta | Falsos positivos de urgência. Dúvidas vencidas que viraram alerta |
| Operação | Latência e custo por caso. Auditoria da amostra aprovada em lote |

## 8. Por que múltiplos agentes

- A **Escuta** é separada do **Cuidado** porque quem conversa com o paciente não pode agir sobre o cuidado. A fronteira de permissão limita o que um texto malicioso ou mal interpretado consegue provocar.
- Os três **especialistas** têm entradas, regras e saídas diferentes: a Intervenção escolhe um item do catálogo, o Relatório redige com fonte por frase e o Território trabalha sobre contagens feitas por regra.
- O **orquestrador** decide quem atua, guarda o estado do caso e consolida as saídas. Em conflito, a regra vence o modelo e a equipe vence os dois.
- O **verificador** usa regras e um segundo modelo, independente de quem produziu a proposta.

## 9. Onde cada módulo do AKCIT aparece

| Nº | Módulo | No Pulse | Etapas |
|---|---|---|---|
| 1 | Prompting | Saída estruturada e modelos de resposta aprovados | E10, E11 |
| 2 | RAG | Bulário, protocolos e histórico, com fonte em cada frase | C12, R03 |
| 3 | Ferramentas | Quatro funções, uma por item do catálogo | C17, C28 |
| 4 | Orquestração | Etapas encadeadas e estado do caso compartilhado | C08, C09 |
| 5 | Multiagentes | Orquestrador, três especialistas e verificador | C15, C16, I01–I03, R01–R02, T01–T03 |
| 6 | Avaliação e segurança | Filtro, verificador e trilha de urgência | E03, E06, C04, C05, C18, U01–U05 |
| 7 | Memória e privacidade | Aceite, estado do paciente e retenção | E04, E13, C10, C26, I02 |
| 8 | LLMOps | Rastro por caso, versões validadas e métricas | C40, C41 e seção 7 |

## 10. Convenções visuais do fluxograma

- Losangos são decisões.
- Em laranja, decisões da equipe de saúde.
- Em vermelho, urgência e segurança.
- Em cinza, saídas laterais.
- Caixas tracejadas são agentes especialistas.
- Os círculos numerados indicam o módulo do AKCIT.

A interface do produto usa as cores da identidade do Pulse: violeta para a Escuta, vermelho para a urgência, azul-petróleo para o Cuidado, laranja para as decisões da equipe e verde para o que foi concluído.
