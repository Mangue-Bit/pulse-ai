import type { ReactNode } from 'react'

import { useEstado, type AbaEquipe } from '@/estado'

import { AbaAcs } from './AbaAcs'
import { AbaAlertas } from './AbaAlertas'
import { AbaAprovacoes } from './AbaAprovacoes'
import { AbaCasos } from './AbaCasos'
import { AbaDuvidas } from './AbaDuvidas'
import { AbaGestor, AbaRelatorios, AbaTerritorio } from './AbasDeVisao'

interface Secao {
  titulo: string
  descricao: string
  conteudo: () => ReactNode
}

const SECOES: Record<Exclude<AbaEquipe, 'visao-geral'>, Secao> = {
  alertas: {
    titulo: 'Alertas de urgência',
    descricao: 'Sinais de urgência percebidos nas conversas. Confirme para assumir o atendimento.',
    conteudo: () => <AbaAlertas />,
  },
  duvidas: {
    titulo: 'Dúvidas sobre remédios',
    descricao: 'Perguntas que só um profissional pode responder. O Pulse não responde nem sugere a resposta.',
    conteudo: () => <AbaDuvidas />,
  },
  aprovacoes: {
    titulo: 'Sugestões para aprovar',
    descricao: 'Ajudas que o Pulse sugere a partir do que o paciente contou. Nada chega ao paciente sem a sua aprovação.',
    conteudo: () => <AbaAprovacoes />,
  },
  casos: {
    titulo: 'Casos em acompanhamento',
    descricao: 'Cada paciente que precisou de ajuda e em que ponto está.',
    conteudo: () => <AbaCasos />,
  },
  acs: {
    titulo: 'Agente comunitário de saúde',
    descricao: 'Tarefas, visitas e resultados do agente comunitário.',
    conteudo: () => <AbaAcs />,
  },
  territorio: {
    titulo: 'Quem visitar primeiro',
    descricao: 'Pacientes da microárea em ordem de prioridade, com o motivo de cada posição.',
    conteudo: () => <AbaTerritorio />,
  },
  relatorios: {
    titulo: 'Relatórios dos pacientes',
    descricao: 'Resumos escritos pelo Pulse, com a fonte de cada frase.',
    conteudo: () => <AbaRelatorios />,
  },
  gestor: {
    titulo: 'Visão do gestor',
    descricao: 'Números por microárea, sem nomes de pacientes.',
    conteudo: () => <AbaGestor />,
  },
}

export function AreaEquipe() {
  const { aba } = useEstado()
  const secao = SECOES[aba === 'visao-geral' ? 'aprovacoes' : aba]

  return (
    <main className="area-equipe rolagem h-full min-h-0" aria-label={secao.titulo}>
      <div className="mx-auto flex flex-col gap-6">
        <header>
          <h1>{secao.titulo}</h1>
          <p className="mt-1 text-muted-foreground">{secao.descricao}</p>
        </header>
        {secao.conteudo()}
      </div>
    </main>
  )
}
