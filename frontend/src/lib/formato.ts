import type { Barreira, EstadoProposta, Papel, SituacaoPaciente, StatusCaso } from '@/api'

export const BARREIRA: Record<Barreira, string> = {
  muitos_medicamentos: 'Muitos medicamentos',
  analfabetismo: 'Dificuldade de leitura',
  rede_de_apoio: 'Rede de apoio',
  acesso_a_remedios: 'Acesso a remédios',
  percepcao_de_melhora: 'Percepção de melhora',
  nao_identificada: 'Não identificada',
}

export const STATUS_CASO: Record<StatusCaso, string> = {
  aberto: 'Aberto',
  aguardando_aprovacao: 'Aguardando aprovação',
  aguardando_resultado: 'Aguardando resultado',
  resolvido: 'Resolvido',
  busca_ativa: 'Busca ativa',
  suspenso: 'Suspenso',
}

export const SITUACAO: Record<SituacaoPaciente, string> = {
  ativo: 'Ativo',
  em_urgencia: 'Em urgência',
  internado: 'Internado',
  aceite_revogado: 'Aceite revogado',
}

export const ESTADO_PROPOSTA: Record<EstadoProposta, string> = {
  pendente: 'Pendente',
  aprovada: 'Aprovada',
  editada: 'Editada',
  recusada: 'Recusada',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
  executada: 'Executada',
  falhou: 'Falhou',
}

export const PAPEL: Record<Papel, string> = {
  plantao: 'Plantão',
  enfermeiro: 'Enfermagem',
  gestor: 'Gestão',
  acs: 'ACS',
}

export const NIVEL: Record<string, string> = {
  plantao: 'Plantão',
  enfermeiro: 'Enfermeiro',
  gestor: 'Gestor',
}

export const FERRAMENTA: Record<string, string> = {
  enviar_mensagem: 'Enviar mensagem',
  criar_tarefa_acs: 'Criar tarefa para o ACS',
  salvar_relatorio: 'Salvar relatório',
  atualizar_lista: 'Atualizar lista do território',
}

export const ORIGEM_FONTE: Record<string, string> = {
  bulario: 'Bulário',
  protocolo: 'Protocolo',
  historico: 'Histórico do paciente',
}

export function rotulo(mapa: Record<string, string>, chave: string | null | undefined): string {
  if (!chave) return 'Sem informação'
  return mapa[chave] ?? chave.replaceAll('_', ' ')
}

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const HORA_SEG = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const DIA = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const DIA_SEMANA = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

export const hora = (iso: string) => HORA.format(new Date(iso))
export const horaComSegundos = (iso: string) => HORA_SEG.format(new Date(iso))
export const dia = (iso: string) => DIA.format(new Date(iso))
export const diaEHora = (iso: string) => `${DIA.format(new Date(iso))} às ${HORA.format(new Date(iso))}`
export const diaDaSemana = (iso: string) => DIA_SEMANA.format(new Date(iso)).replace('.', '')

export function duracao(minutos: number): string {
  const m = Math.abs(Math.round(minutos))
  if (m < 60) return `${m} min`
  if (m < 60 * 24) {
    const h = Math.floor(m / 60)
    const resto = m % 60
    return resto ? `${h} h ${resto} min` : `${h} h`
  }
  const d = Math.floor(m / (60 * 24))
  const h = Math.round((m % (60 * 24)) / 60)
  return h ? `${d} d ${h} h` : `${d} d`
}

/** Prazo em relação ao relógio do sistema: "vence em 12 min" ou "venceu há 3 min". */
export function prazoRelativo(prazoIso: string, agoraIso: string): { texto: string; vencido: boolean } {
  const minutos = (new Date(prazoIso).getTime() - new Date(agoraIso).getTime()) / 60000
  if (minutos < 0) return { texto: `venceu há ${duracao(minutos)}`, vencido: true }
  if (minutos < 1) return { texto: 'vence agora', vencido: false }
  return { texto: `vence em ${duracao(minutos)}`, vencido: false }
}

export function porcento(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'sem dados'
  return `${Math.round(valor * 100)}%`
}

export function dolares(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'sem dados'
  if (valor === 0) return 'US$ 0'
  return `US$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

export function milissegundos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return 'sem dados'
  if (valor >= 1000) return `${(valor / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`
  return `${Math.round(valor)} ms`
}

/** Texto curto para um valor qualquer do rastro (entrada e saída dos eventos). */
export function valorLegivel(valor: unknown): string {
  if (valor === null || valor === undefined) return 'vazio'
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não'
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number') return valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
  if (Array.isArray(valor)) {
    if (valor.length === 0) return 'nenhum'
    if (valor.every((v) => typeof v !== 'object' || v === null)) return valor.map(valorLegivel).join(', ')
    return JSON.stringify(valor, null, 1)
  }
  return JSON.stringify(valor, null, 1)
}

export const nomeDoCampo = (chave: string) => chave.replaceAll('_', ' ')
