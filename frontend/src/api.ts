// Cliente da API do Pulse. Os tipos espelham os contratos do backend
// (backend/app/contratos.py) e as visões devolvidas pelas rotas.

export type Barreira =
  | 'muitos_medicamentos'
  | 'analfabetismo'
  | 'rede_de_apoio'
  | 'acesso_a_remedios'
  | 'percepcao_de_melhora'
  | 'nao_identificada'

export type Canal = 'texto' | 'audio'
export type SituacaoPaciente = 'ativo' | 'em_urgencia' | 'internado' | 'aceite_revogado'
export type StatusCaso =
  | 'aberto'
  | 'aguardando_aprovacao'
  | 'aguardando_resultado'
  | 'resolvido'
  | 'busca_ativa'
  | 'suspenso'
export type EstadoProposta =
  | 'pendente'
  | 'aprovada'
  | 'editada'
  | 'recusada'
  | 'expirada'
  | 'cancelada'
  | 'executada'
  | 'falhou'
export type Especialista = 'intervencao' | 'relatorio' | 'territorio'
export type Risco = 'baixo' | 'alto'
export type Ator = 'regra' | 'modelo' | 'pessoa' | 'ferramenta'
export type Papel = 'plantao' | 'enfermeiro' | 'gestor' | 'acs'

export interface Saude {
  status: 'ok'
  modelo: string
  modelo_verificador: string
  modelo_simulado: boolean
  agora: string
}

export interface Paciente {
  id: string
  nome: string
  idade: number
  microarea_id: string
  microarea_nome: string
  acs_id: string
  acs_nome: string
  condicoes: string[]
  medicamentos: string[]
  situacao: SituacaoPaciente
  aceite_valido: boolean
  risco_abandono: number
  alto_risco: boolean
}

export interface Profissional {
  id: string
  nome: string
  papel: Papel
  microarea_id: string | null
}

export interface MensagemConversa {
  id: string
  autor: 'paciente' | 'pulse' | 'equipe'
  canal: Canal
  texto: string
  tipo: 'mensagem' | 'fixa' | 'resposta' | 'aprovada'
  etapa: string | null
  criado_em: string
}

export interface Conversa {
  paciente_id: string
  aceite_valido: boolean
  mensagens: MensagemConversa[]
}

export type DesfechoEscuta =
  | 'urgencia'
  | 'pedido_de_aceite'
  | 'esclarecimento'
  | 'encaminhado_a_equipe'
  | 'duvida_clinica'
  | 'relato'

export interface RespostaMensagem {
  interacao_id: string
  desfecho: DesfechoEscuta
  mensagens: MensagemConversa[]
}

export interface EstadoAceite {
  paciente_id: string
  aceite_valido: boolean
  propostas_canceladas: number
}

export interface Disparo {
  tipo: string
  descricao: string
}

export interface Relogio {
  agora: string
  deslocamento_minutos: number
  disparos?: Disparo[]
}

export interface Alerta {
  id: string
  paciente_id: string
  paciente_nome: string
  origem: 'escuta' | 'cuidado' | 'duvida_vencida'
  regra: string
  trecho_literal: string
  nivel: 'plantao' | 'enfermeiro' | 'gestor'
  status: 'aberto' | 'confirmado' | 'pendencia_critica' | 'encerrado'
  prazo: string
  niveis_avisados: { nivel: string; avisado_em: string }[]
  confirmado_por: string | null
  confirmado_em: string | null
  criado_em: string
}

export interface Duvida {
  id: string
  paciente_id: string
  paciente_nome: string
  texto: string
  prazo: string
  status: 'aberta' | 'respondida' | 'vencida'
  resposta: string | null
  respondida_por: string | null
  respondida_em: string | null
  vencida_em: string | null
  criado_em: string
}

export interface Fonte {
  id: string
  origem: 'bulario' | 'protocolo' | 'historico'
  titulo: string
  trecho: string
}

export interface Verificacao {
  aprovada: boolean
  motivos: string[]
  regras: { regra: string; passou: boolean; detalhe: string }[]
  modelo: string | null
}

export interface Proposta {
  id: string
  caso_id: string
  especialista: Especialista
  item_catalogo_id: string | null
  ferramenta: string
  argumentos: Record<string, unknown>
  justificativa: string
  fontes: Fonte[]
  risco: Risco
  estado: EstadoProposta
  verificacao: Verificacao | null
  validade: string
  // Campos de visão, montados pela rota a partir do caso e do relato.
  paciente_id: string
  paciente_nome: string
  barreira: Barreira | null
  trecho_literal: string | null
  item_nome: string | null
  resumo: string
  texto_mensagem: string | null
  canal: Canal | 'presencial' | null
  criado_em: string
  decidida_por: string | null
  decidida_em: string | null
  motivo: string | null
}

export interface Caso {
  caso_id: string
  paciente_id: string
  paciente_nome: string
  microarea_id: string
  status: StatusCaso
  situacao_paciente: SituacaoPaciente
  rodada: number
  pendencias: string[]
  validade: string | null
  barreira: Barreira | null
  desfecho: 'resolvido' | 'busca_ativa' | 'sem_registro' | null
  aberto_em: string
  atualizado_em: string
}

export interface Relato {
  id: string
  paciente_id: string
  tipo: 'relato' | 'duvida'
  barreira: Barreira | null
  lembrete: string | null
  trecho_literal: string
  certeza: number
  criado_em: string
}

export interface Tarefa {
  id: string
  paciente_id: string
  paciente_nome: string
  acs_id: string
  caso_id: string | null
  tipo: string
  descricao: string
  prazo: string | null
  status: 'aberta' | 'concluida'
  origem: 'ferramenta' | 'manual' | 'urgencia'
  criado_em: string
}

export interface Resultado {
  id: string
  caso_id: string
  proposta_id: string | null
  barreira_resolvida: boolean
  observacao: string
  registrado_por: string
  criado_em: string
}

export interface CasoDetalhe extends Caso {
  relatos: Relato[]
  propostas: Proposta[]
  tarefas: Tarefa[]
  resultados: Resultado[]
}

export interface Evento {
  id: string
  caso_id: string | null
  paciente_id: string
  interacao_id: string | null
  etapa: string
  ator: Ator
  entrada: Record<string, unknown>
  saida: Record<string, unknown>
  modelo: string | null
  versao_prompt: string | null
  latencia_ms: number | null
  tokens_entrada: number | null
  tokens_saida: number | null
  custo: number | null
  criado_em: string
}

export interface ItemDaLista {
  paciente_id: string
  paciente_nome: string
  posicao: number
  motivo: string
}

export interface Territorio {
  microarea_id: string
  microarea_nome: string
  acs: { id: string; nome: string }[]
  lista_atualizada_em: string | null
  lista: ItemDaLista[]
  tarefas: Tarefa[]
  avisos: { paciente_id: string; paciente_nome: string; texto: string; criado_em: string }[]
  casos_aguardando_resultado: Caso[]
}

export interface NumerosDaMicroarea {
  microarea_id: string
  microarea_nome: string
  pacientes: number
  alto_risco: number
  sem_aceite: number
  em_urgencia: number
  casos_abertos: number
  aguardando_aprovacao: number
  aguardando_resultado: number
  busca_ativa: number
  resolvidos: number
}

export interface ResumoGestor {
  microareas: NumerosDaMicroarea[]
  totais: Omit<NumerosDaMicroarea, 'microarea_id' | 'microarea_nome'>
}

export interface Relatorio {
  id: string
  paciente_id: string
  paciente_nome: string
  caso_id: string | null
  frases: { texto: string; fonte_id: string; fonte_titulo: string }[]
  criado_em: string
}

export interface Metricas {
  aprovacao: { taxa_sem_edicao: number | null; aprovadas: number; editadas: number; recusadas: number }
  verificador: { taxa_reprovacao: number | null; verificadas: number; reprovadas: number }
  urgencia: { alertas: number; falsos_positivos: number; duvidas_vencidas: number }
  operacao: {
    casos: number
    chamadas: number
    latencia_media_ms: number | null
    custo_total: number
    custo_medio_por_caso: number | null
  }
  por_prompt: {
    versao_prompt: string
    modelo: string
    chamadas: number
    falhas: number
    latencia_media_ms: number
    custo: number
  }[]
  teste_fixo: {
    executado_em: string
    modelo: string
    total: number
    urgencias: { esperadas: number; detectadas: number }
    barreiras: { total: number; acertos: number }
    duvidas: { total: number; acertos: number }
    injecoes: { total: number; contidas: number }
  } | null
  modelo_de_risco: { versao: string; situacao: string; simulado: boolean }
}

export class ErroDaApi extends Error {
  status: number

  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

async function pedir<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  if (!resposta.ok) {
    let detalhe = resposta.statusText
    try {
      const erro = await resposta.json()
      if (typeof erro.detail === 'string') detalhe = erro.detail
    } catch {
      // resposta de erro sem corpo JSON: fica o texto do status
    }
    throw new ErroDaApi(resposta.status, detalhe)
  }
  return resposta.json() as Promise<T>
}

const consulta = (parametros: Record<string, string | number | undefined | null>) => {
  const pares = Object.entries(parametros).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return pares.length ? `?${new URLSearchParams(pares.map(([k, v]) => [k, String(v)]))}` : ''
}

export const api = {
  saude: () => pedir<Saude>('GET', '/saude'),
  pacientes: () => pedir<Paciente[]>('GET', '/pacientes'),
  equipe: () => pedir<Profissional[]>('GET', '/equipe'),

  // Paciente (Escuta)
  enviarMensagem: (paciente_id: string, texto: string, canal: Canal) =>
    pedir<RespostaMensagem>('POST', '/mensagens', { paciente_id, texto, canal }),
  conversa: (paciente_id: string) => pedir<Conversa>('GET', `/conversas/${paciente_id}`),
  registrarAceite: (paciente_id: string) => pedir<EstadoAceite>('POST', '/aceite', { paciente_id }),
  revogarAceite: (paciente_id: string) => pedir<EstadoAceite>('DELETE', `/aceite/${paciente_id}`),

  // Relógio do sistema
  relogio: () => pedir<Relogio>('GET', '/relogio'),
  avancarRelogio: (minutos: number) => pedir<Relogio>('POST', '/relogio/avancar', { minutos }),

  // Trilha de urgência e fila do profissional
  alertas: () => pedir<Alerta[]>('GET', '/alertas'),
  confirmarAlerta: (id: string, profissional: string) =>
    pedir<Alerta>('POST', `/alertas/${id}/confirmar`, { profissional }),
  encerrarAlerta: (id: string, profissional: string, falso_positivo: boolean) =>
    pedir<Alerta>('POST', `/alertas/${id}/encerrar`, { profissional, falso_positivo }),
  duvidas: () => pedir<Duvida[]>('GET', '/duvidas'),
  responderDuvida: (id: string, profissional: string, resposta: string) =>
    pedir<Duvida>('POST', `/duvidas/${id}/responder`, { profissional, resposta }),

  // Fila de aprovação
  propostas: (estado?: EstadoProposta) => pedir<Proposta[]>('GET', `/propostas${consulta({ estado })}`),
  aprovarProposta: (id: string, profissional: string) =>
    pedir<Proposta>('POST', `/propostas/${id}/aprovar`, { profissional }),
  editarProposta: (
    id: string,
    profissional: string,
    edicao: { texto?: string; canal?: Canal; descricao?: string },
  ) => pedir<Proposta>('POST', `/propostas/${id}/editar`, { profissional, ...edicao }),
  recusarProposta: (id: string, profissional: string, justificativa: string) =>
    pedir<Proposta>('POST', `/propostas/${id}/recusar`, { profissional, justificativa }),

  // Casos e rastro
  casos: () => pedir<Caso[]>('GET', '/casos'),
  caso: (id: string) => pedir<CasoDetalhe>('GET', `/casos/${id}`),
  registrarResultado: (
    caso_id: string,
    acs_id: string,
    barreira_resolvida: boolean,
    observacao: string,
  ) => pedir<CasoDetalhe>('POST', `/casos/${caso_id}/resultado`, { acs_id, barreira_resolvida, observacao }),
  eventosDoCaso: (caso_id: string) => pedir<Evento[]>('GET', `/casos/${caso_id}/eventos`),
  eventos: (filtro: { paciente_id?: string; depois_de?: string; limite?: number } = {}) =>
    pedir<Evento[]>('GET', `/eventos${consulta(filtro)}`),

  // ACS, território, relatórios e gestor
  registrarVisita: (
    paciente_id: string,
    acs_id: string,
    tipo: 'visita' | 'contato' | 'observacao',
    texto: string,
  ) =>
    pedir<{ interacao_id: string; caso_id: string | null }>('POST', '/acs/registros', {
      paciente_id,
      acs_id,
      tipo,
      texto,
    }),
  territorio: (microarea_id: string) => pedir<Territorio>('GET', `/territorio/${microarea_id}`),
  relatorios: (paciente_id?: string) => pedir<Relatorio[]>('GET', `/relatorios${consulta({ paciente_id })}`),
  resumoGestor: () => pedir<ResumoGestor>('GET', '/gestor/resumo'),

  // Observabilidade e demonstração
  metricas: () => pedir<Metricas>('GET', '/metricas'),
  reiniciarDemonstracao: () => pedir<{ status: 'ok' }>('POST', '/demo/reiniciar'),
}
