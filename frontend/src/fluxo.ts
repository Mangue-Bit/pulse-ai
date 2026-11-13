// As 69 etapas do fluxo do Pulse, transcritas de docs/fluxo-do-produto.md.
// A tela lê o rastro pelo identificador da etapa: qualquer etapa que registre
// evento aparece na linha do tempo e no mapa sem código extra.

import type { Ator, Evento } from '@/api'

export type Grupo = 'escuta' | 'urgencia' | 'cuidado'
export type Cor = 'escuta' | 'urgencia' | 'cuidado' | 'equipe' | 'concluido' | 'lateral'

export interface Etapa {
  id: string
  nome: string
  grupo: Grupo
  decisao: boolean
  lateral: boolean
  saidas: string[]
  col: number
  lin: number
  especialista?: 'Intervenção' | 'Relatório' | 'Território'
}

type Linha = [id: string, nome: string, saidas: string, col: number, lin: number, marcas?: string]

// marcas: "d" decisão, "l" saída lateral
const LINHAS: Linha[] = [
  // Agente de Escuta
  ['E01', 'Mensagem do paciente', 'E02', 0, 0],
  ['E02', 'Normaliza a entrada', 'E03', 1, 0],
  ['E03', 'Sinal de urgência?', 'U01 E04', 2, 0, 'd'],
  ['E04', 'Aceite válido?', 'E06 E05', 3, 0, 'd'],
  ['E05', 'Pede o aceite', '', 0, 1, 'l'],
  ['E06', 'Deu para entender?', 'E08 E07', 1, 1, 'd'],
  ['E07', 'Pede esclarecimento', '', 2, 1, 'l'],
  ['E08', 'Dúvida clínica?', 'E09 E10', 3, 1, 'd'],
  ['E09', 'Mensagem fixa', 'E12', 0, 2],
  ['E10', 'Interpreta o relato', 'E11', 1, 2],
  ['E11', 'Responde ao paciente', 'E12', 2, 2],
  ['E12', 'Registra o relato estruturado', 'C04', 3, 2],
  ['E13', 'Paciente recebe a mensagem', '', 0, 3],
  // Trilha de urgência
  ['U01', 'Mensagem fixa de emergência', 'U02', 0, 4],
  ['U02', 'Alerta a equipe, um nível por vez', 'U03', 1, 4],
  ['U03', 'Alguém confirmou?', 'U05 U04', 2, 4, 'd'],
  ['U04', 'Pendência crítica', '', 3, 4, 'l'],
  ['U05', 'Profissional assume o caso', '', 2, 5],
  // Cuidado: entradas e triagem
  ['C01', 'Alto risco de abandono', 'C04', 0, 6],
  ['C02', 'Input do ACS', 'C04', 1, 6],
  ['C03', 'Checagem por tempo', 'C04', 2, 6],
  ['C04', 'Filtro de entrada', 'C05', 3, 6],
  ['C05', 'Algum sinal de alarme?', 'U01 C06', 0, 7, 'd'],
  ['C06', 'É dúvida clínica?', 'C07 C08', 1, 7, 'd'],
  ['C07', 'Fila do profissional, com prazo', 'U02', 2, 7],
  ['C08', 'Orquestrador abre ou retoma o caso', 'C09 C10', 3, 7],
  // Orquestração e contexto
  ['C09', 'Estado do caso', '', 0, 8],
  ['C10', 'Paciente ativo?', 'C12 C11', 1, 8, 'd'],
  ['C11', 'Suspende a fila do paciente', '', 2, 8, 'l'],
  ['C12', 'Recupera o contexto (RAG)', 'C13', 3, 8],
  ['C13', 'Há informação suficiente?', 'C15 C14', 0, 9, 'd'],
  ['C14', 'Diz o que falta', '', 1, 9, 'l'],
  ['C15', 'Orquestrador delega', 'I01 R01 T01', 2, 9],
  // Especialistas
  ['I01', 'Lê o fator de risco', 'I02', 0, 10],
  ['I02', 'Regras filtram o catálogo', 'I03', 0, 11],
  ['I03', 'Escolhe a intervenção', 'C16', 0, 12],
  ['R01', 'Junta registro e histórico', 'R02', 1, 10],
  ['R02', 'Redige o relatório', 'R03', 1, 11],
  ['R03', 'Cita a fonte de cada frase', 'C16', 1, 12],
  ['T01', 'Regras agrupam (sem IA)', 'T02', 2, 10],
  ['T02', 'Prioriza e sugere por microárea', 'T03', 2, 11],
  ['T03', 'Monta as duas visões', 'C16', 2, 12],
  // Consolidação e verificação
  ['C16', 'Orquestrador consolida', 'C18 C17', 0, 13],
  ['C17', 'Sem item ou ferramenta', '', 1, 13, 'l'],
  ['C18', 'Verificador independente', 'C20 C19', 2, 13, 'd'],
  ['C19', 'Refaz uma vez', 'C18', 3, 13],
  // Aprovação pela equipe de saúde
  ['C20', 'Qual o risco do item?', 'C21 C22', 0, 14, 'd'],
  ['C21', 'Baixo risco: fila em lote', 'C23', 1, 14],
  ['C22', 'Alto risco: aprovação individual', 'C23', 2, 14],
  ['C23', 'Equipe de saúde aprova a proposta?', 'C26 C24 C25', 3, 14, 'd'],
  ['C24', 'Encerrado', '', 0, 15, 'l'],
  ['C25', 'Lembra e escalona', '', 1, 15, 'l'],
  ['C26', 'Ainda vale executar?', 'C28 C27', 2, 15, 'd'],
  ['C27', 'Cancela e registra', '', 3, 15, 'l'],
  // Execução por ferramentas
  ['C28', 'Ferramentas executam (function calling)', 'C29 E13', 0, 16],
  ['C29', 'Execução confirmada?', 'C31 C32 C33 C30', 1, 16, 'd'],
  ['C30', 'Mostra a falha', 'C28', 2, 16],
  ['C31', 'Intervenção feita', 'C34', 0, 17],
  ['C32', 'Relatório do paciente', 'C34', 1, 17],
  ['C33', 'Relatório do território', 'C34', 2, 17],
  ['C34', 'Resultado registrado?', 'C36 C35', 3, 17, 'd'],
  // Desfecho e rodadas
  ['C35', 'Sem registro', '', 0, 18, 'l'],
  ['C36', 'Barreira resolvida?', 'C37 C38', 1, 18, 'd'],
  ['C37', 'Caso encerrado: resolvido', 'C40', 2, 18],
  ['C38', 'Atingiu o limite?', 'C39 C03', 3, 18, 'd'],
  ['C39', 'Busca ativa presencial', 'C40', 0, 19],
  // Ciclo de aprendizado
  ['C40', 'Ciclo de aprendizado', 'C41', 1, 19],
  ['C41', 'Modelo novo validado?', 'C01 C42', 2, 19, 'd'],
  ['C42', 'Mantém a versão atual', '', 3, 19, 'l'],
]

const ESPECIALISTAS: Record<string, Etapa['especialista']> = {
  I: 'Intervenção',
  R: 'Relatório',
  T: 'Território',
}

export const ETAPAS: Etapa[] = LINHAS.map(([id, nome, saidas, col, lin, marcas = '']) => ({
  id,
  nome,
  grupo: id[0] === 'E' ? 'escuta' : id[0] === 'U' ? 'urgencia' : 'cuidado',
  decisao: marcas.includes('d'),
  lateral: marcas.includes('l'),
  saidas: saidas ? saidas.split(' ') : [],
  col,
  lin,
  especialista: ESPECIALISTAS[id[0]],
}))

export const ETAPA_POR_ID: Record<string, Etapa> = Object.fromEntries(ETAPAS.map((e) => [e.id, e]))

export const FAIXAS: { grupo: Grupo; titulo: string; de: number; ate: number }[] = [
  { grupo: 'escuta', titulo: 'Agente de Escuta', de: 0, ate: 3 },
  { grupo: 'urgencia', titulo: 'Trilha de urgência', de: 4, ate: 5 },
  { grupo: 'cuidado', titulo: 'Agente de Cuidado', de: 6, ate: 19 },
]

const CONCLUIDAS = new Set(['C29', 'C31', 'C32', 'C33', 'C37', 'E13'])

export function nomeDaEtapa(id: string): string {
  return ETAPA_POR_ID[id]?.nome ?? 'Etapa do fluxo'
}

/** Cor de uma etapa no mapa, sem considerar quem agiu. */
export function corDaEtapa(id: string): Cor {
  const etapa = ETAPA_POR_ID[id]
  if (etapa?.lateral) return 'lateral'
  if (CONCLUIDAS.has(id)) return 'concluido'
  if (id === 'C23') return 'equipe'
  if (id[0] === 'E') return 'escuta'
  if (id[0] === 'U') return 'urgencia'
  return 'cuidado'
}

/** Cor de um evento: decisões de pessoas da equipe aparecem em laranja. */
export function corDoEvento(evento: Pick<Evento, 'etapa' | 'ator'>): Cor {
  const base = corDaEtapa(evento.etapa)
  const daEquipe = evento.ator === 'pessoa' && evento.etapa[0] !== 'E'
  if (daEquipe && base !== 'concluido') return 'equipe'
  return base
}

export const ROTULO_DA_COR: Record<Cor, string> = {
  escuta: 'Escuta',
  urgencia: 'Urgência',
  cuidado: 'Cuidado',
  equipe: 'Decisão da equipe',
  concluido: 'Concluído',
  lateral: 'Saída lateral',
}

export const ROTULO_DO_ATOR: Record<Ator, string> = {
  regra: 'Regra',
  modelo: 'Modelo',
  pessoa: 'Pessoa',
  ferramenta: 'Ferramenta',
}

/** Lado da fronteira de permissão em que a etapa fica. */
export function ladoDaFronteira(id: string): 'paciente' | 'cuidado' {
  return id[0] === 'E' || id[0] === 'U' ? 'paciente' : 'cuidado'
}

/** Descrição da travessia entre duas etapas consecutivas do rastro, se houver. */
export function travessia(anterior: string, atual: string): string | null {
  if (ladoDaFronteira(anterior) === ladoDaFronteira(atual)) return null
  if (atual === 'C04') return 'Relato estruturado atravessa a fronteira'
  if (atual === 'E13') return 'Mensagem aprovada atravessa a fronteira'
  if (atual === 'U01') return 'Sinal de alarme atravessa a fronteira'
  if (atual === 'U02') return 'Dúvida vencida atravessa a fronteira'
  return null
}

/** Classes de cor (texto, fundo suave, borda, fundo cheio) para cada cor do fluxograma. */
export const CLASSES: Record<Cor, { texto: string; suave: string; borda: string; cheio: string }> = {
  escuta: { texto: 'text-escuta', suave: 'bg-escuta-suave', borda: 'border-escuta', cheio: 'bg-escuta' },
  urgencia: { texto: 'text-urgencia', suave: 'bg-urgencia-suave', borda: 'border-urgencia', cheio: 'bg-urgencia' },
  cuidado: { texto: 'text-cuidado', suave: 'bg-cuidado-suave', borda: 'border-cuidado', cheio: 'bg-cuidado' },
  equipe: { texto: 'text-equipe', suave: 'bg-equipe-suave', borda: 'border-equipe', cheio: 'bg-equipe' },
  concluido: { texto: 'text-concluido', suave: 'bg-concluido-suave', borda: 'border-concluido', cheio: 'bg-concluido' },
  lateral: { texto: 'text-lateral', suave: 'bg-lateral-suave', borda: 'border-lateral', cheio: 'bg-lateral' },
}

export const VARIAVEL_DA_COR: Record<Cor, string> = {
  escuta: 'var(--escuta)',
  urgencia: 'var(--urgencia)',
  cuidado: 'var(--cuidado)',
  equipe: 'var(--equipe)',
  concluido: 'var(--concluido)',
  lateral: 'var(--lateral)',
}

export const VARIAVEL_SUAVE: Record<Cor, string> = {
  escuta: 'var(--escuta-suave)',
  urgencia: 'var(--urgencia-suave)',
  cuidado: 'var(--cuidado-suave)',
  equipe: 'var(--equipe-suave)',
  concluido: 'var(--concluido-suave)',
  lateral: 'var(--lateral-suave)',
}
