import type { Ator, Evento } from '@/api'
import { BARREIRA, rotulo } from '@/lib/formato'

export type EstadoDoPasso = 'feito' | 'agora' | 'depois' | 'parado'
export type TomDaTrilha = 'cuidado' | 'urgencia'

export interface Passo {
  titulo: string
  detalhe: string
  estado: EstadoDoPasso
}

export interface Trilha {
  tom: TomDaTrilha
  passos: Passo[]
}

interface Marco {
  titulo: string
  detalhe: string
  etapas: string[]
  ator?: Ator
  aoAlcancar?: (evento: Evento) => string | null
}

interface Interrupcao {
  etapa: string
  detalhe: string
}

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor ? valor : null)

const RELATA: Marco = { titulo: 'Paciente relata', detalhe: 'Por texto ou por voz', etapas: ['E01'] }

const INTERPRETA: Marco = {
  titulo: 'Escuta interpreta',
  detalhe: 'Identifica a barreira',
  etapas: ['E10', 'E12'],
  aoAlcancar: (evento) => {
    const barreira = texto(evento.saida.barreira)
    return barreira ? `Barreira: ${rotulo(BARREIRA, barreira).toLowerCase()}` : null
  },
}

const SEM_CONVERSA: Marco = {
  titulo: 'Caso aberto',
  detalhe: 'Por risco, ACS ou prazo',
  etapas: ['C01', 'C02', 'C03', 'C04', 'C08'],
}

const PROPOE: Marco = {
  titulo: 'Cuidado propõe',
  detalhe: 'Com fontes e verificador',
  etapas: ['C20', 'C21', 'C22'],
}

const APROVA: Marco = {
  titulo: 'Equipe decide',
  detalhe: 'Nada sai sem decisão humana',
  etapas: ['C23'],
  ator: 'pessoa',
  aoAlcancar: (evento) => {
    const profissional = texto(evento.saida.profissional)
    const decisao = texto(evento.saida.decisao)
    const verbo = decisao === 'recusa' ? 'Recusada' : decisao === 'edita' ? 'Editada e aprovada' : 'Aprovada'
    return profissional ? `${verbo} por ${profissional}` : verbo
  },
}

const RECEBE: Marco = {
  titulo: 'Paciente recebe',
  detalhe: 'Mensagem ou visita do ACS',
  etapas: ['E13', 'C31', 'C32', 'C33'],
  aoAlcancar: (evento) => (evento.etapa === 'E13' ? 'Mensagem entregue ao paciente' : 'Ação registrada no caso'),
}

const INTERRUPCOES_DO_CUIDADO: Interrupcao[] = [
  { etapa: 'C24', detalhe: 'Proposta recusada: nada é enviado' },
  { etapa: 'C27', detalhe: 'Proposta cancelada antes do envio' },
  { etapa: 'C17', detalhe: 'Sem item no catálogo: vira tarefa manual' },
  { etapa: 'C11', detalhe: 'Paciente não está ativo: fila suspensa' },
]

const URGENCIA: Marco[] = [
  RELATA,
  { titulo: 'Urgência detectada', detalhe: 'Regras e modelo avaliam juntos', etapas: ['E03', 'C05'] },
  { titulo: 'Orientação imediata', detalhe: 'Ligue 192 ou vá à UPA', etapas: ['U01'] },
  { titulo: 'Equipe alertada', detalhe: 'Um nível por vez, com prazo', etapas: ['U02'] },
  { titulo: 'Profissional assume', detalhe: 'Contato humano com o paciente', etapas: ['U05'] },
]

const DUVIDA: Marco[] = [
  { ...RELATA, titulo: 'Paciente pergunta' },
  { titulo: 'Dúvida clínica', detalhe: 'O agente nunca responde', etapas: ['E08'] },
  { titulo: 'Paciente avisado', detalhe: 'Um profissional responde no prazo', etapas: ['E09'] },
  { titulo: 'Fila do profissional', detalhe: 'Com prazo para a resposta', etapas: ['C07'] },
  { titulo: 'Profissional responde', detalhe: 'A resposta é sempre humana', etapas: ['C07'], ator: 'pessoa' },
]

const SEM_ACEITE: Marco[] = [
  RELATA,
  { titulo: 'Sem autorização', detalhe: 'O paciente ainda não aceitou o contato', etapas: ['E04'] },
  { titulo: 'Pulse pede o aceite', detalhe: 'E avisa o agente comunitário', etapas: ['E05'] },
]

const ESCLARECIMENTO: Marco[] = [
  RELATA,
  { titulo: 'Não deu para entender', detalhe: 'A mensagem não é interpretada', etapas: ['E06'] },
  { titulo: 'Pulse pede esclarecimento', detalhe: 'Na segunda vez, vai para a equipe', etapas: ['E07'] },
]

function recorte(eventos: Evento[]): Evento[] {
  for (let indice = eventos.length - 1; indice >= 0; indice -= 1) {
    if (eventos[indice].etapa === 'E01') return eventos.slice(indice)
  }
  return eventos
}

function escolher(etapas: Set<string>): { tom: TomDaTrilha; marcos: Marco[]; interrupcoes: Interrupcao[] } {
  if (etapas.has('U01')) return { tom: 'urgencia', marcos: URGENCIA, interrupcoes: [{ etapa: 'U04', detalhe: 'Ninguém confirmou: pendência crítica' }] }
  if (etapas.has('E09') || etapas.has('C07')) return { tom: 'cuidado', marcos: DUVIDA, interrupcoes: [] }
  if (etapas.has('E05')) return { tom: 'cuidado', marcos: SEM_ACEITE, interrupcoes: [] }
  if (etapas.has('E07') && !etapas.has('E10')) return { tom: 'cuidado', marcos: ESCLARECIMENTO, interrupcoes: [] }
  const veioDaConversa = etapas.size === 0 || etapas.has('E01')
  return {
    tom: 'cuidado',
    marcos: [...(veioDaConversa ? [RELATA, INTERPRETA] : [SEM_CONVERSA]), PROPOE, APROVA, RECEBE],
    interrupcoes: INTERRUPCOES_DO_CUIDADO,
  }
}

export function montarTrilha(eventos: Evento[]): Trilha {
  const atuais = recorte(eventos)
  const etapas = new Set(atuais.map((evento) => evento.etapa))
  const { tom, marcos, interrupcoes } = escolher(etapas)

  const alcancados = marcos.map((marco) =>
    atuais.findLast((evento) => marco.etapas.includes(evento.etapa) && (!marco.ator || evento.ator === marco.ator)),
  )
  const ultimoFeito = alcancados.findLastIndex((evento) => evento !== undefined)
  const interrupcao = interrupcoes.find(({ etapa }) => etapas.has(etapa))

  const passos = marcos.map((marco, indice): Passo => {
    const evento = alcancados[indice]
    if (indice <= ultimoFeito) {
      return { titulo: marco.titulo, detalhe: (evento && marco.aoAlcancar?.(evento)) ?? marco.detalhe, estado: 'feito' }
    }
    if (indice === ultimoFeito + 1) {
      return interrupcao
        ? { titulo: marco.titulo, detalhe: interrupcao.detalhe, estado: 'parado' }
        : { titulo: marco.titulo, detalhe: marco.detalhe, estado: 'agora' }
    }
    return { titulo: marco.titulo, detalhe: marco.detalhe, estado: 'depois' }
  })

  return { tom, passos }
}
