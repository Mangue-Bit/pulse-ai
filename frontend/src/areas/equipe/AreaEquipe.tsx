import type { ReactNode } from 'react'

import {
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderOpen,
  MapPinned,
  MessageCircleQuestion,
  Siren,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import { Selecao } from '@/componentes/basicos'
import { useEstado, type AbaEquipe } from '@/estado'
import { PAPEL } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { AbaAcs } from './AbaAcs'
import { AbaAlertas } from './AbaAlertas'
import { AbaAprovacoes } from './AbaAprovacoes'
import { AbaCasos } from './AbaCasos'
import { AbaDuvidas } from './AbaDuvidas'
import { AbaGestor, AbaRelatorios, AbaTerritorio } from './AbasDeVisao'

interface Secao {
  nome: string
  titulo: string
  descricao: string
  icone: LucideIcon
  conteudo: () => ReactNode
}

const SECOES: Record<AbaEquipe, Secao> = {
  alertas: {
    nome: 'Alertas',
    titulo: 'Alertas de urgência',
    descricao: 'Sinais de urgência percebidos nas conversas. Confirme para assumir o atendimento.',
    icone: Siren,
    conteudo: () => <AbaAlertas />,
  },
  duvidas: {
    nome: 'Dúvidas',
    titulo: 'Dúvidas sobre remédios',
    descricao: 'Perguntas que só um profissional pode responder. O Pulse não responde nem sugere a resposta.',
    icone: MessageCircleQuestion,
    conteudo: () => <AbaDuvidas />,
  },
  aprovacoes: {
    nome: 'Aprovações',
    titulo: 'Sugestões para aprovar',
    descricao: 'Ajudas que o Pulse sugere a partir do que o paciente contou. Nada chega ao paciente sem a sua aprovação.',
    icone: ClipboardCheck,
    conteudo: () => <AbaAprovacoes />,
  },
  casos: {
    nome: 'Casos',
    titulo: 'Casos em acompanhamento',
    descricao: 'Cada paciente que precisou de ajuda e em que ponto está.',
    icone: FolderOpen,
    conteudo: () => <AbaCasos />,
  },
  acs: {
    nome: 'Agente comunitário',
    titulo: 'Agente comunitário de saúde',
    descricao: 'Tarefas, visitas e resultados do agente comunitário.',
    icone: UserRound,
    conteudo: () => <AbaAcs />,
  },
  territorio: {
    nome: 'Território',
    titulo: 'Quem visitar primeiro',
    descricao: 'Pacientes da microárea em ordem de prioridade, com o motivo de cada posição.',
    icone: MapPinned,
    conteudo: () => <AbaTerritorio />,
  },
  relatorios: {
    nome: 'Relatórios',
    titulo: 'Relatórios dos pacientes',
    descricao: 'Resumos escritos pelo Pulse, com a fonte de cada frase.',
    icone: FileText,
    conteudo: () => <AbaRelatorios />,
  },
  gestor: {
    nome: 'Visão do gestor',
    titulo: 'Visão do gestor',
    descricao: 'Números por microárea, sem nomes de pacientes.',
    icone: BarChart3,
    conteudo: () => <AbaGestor />,
  },
}

const GRUPOS: { titulo: string; abas: AbaEquipe[] }[] = [
  { titulo: 'Precisa de você', abas: ['alertas', 'duvidas', 'aprovacoes'] },
  { titulo: 'Acompanhamento', abas: ['casos', 'acs', 'territorio', 'relatorios'] },
  { titulo: 'Gestão', abas: ['gestor'] },
]

export function AreaEquipe() {
  const { aba, abrirAba, alertas, duvidas, propostas, equipe, atuando, escolherAtuando } = useEstado()

  const contadores: Partial<Record<AbaEquipe, { valor: number; tom: string }>> = {
    alertas: {
      valor: (alertas.dados ?? []).filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica').length,
      tom: 'bg-urgencia text-white',
    },
    duvidas: {
      valor: (duvidas.dados ?? []).filter((d) => d.status !== 'respondida').length,
      tom: 'bg-equipe text-white',
    },
    aprovacoes: {
      valor: (propostas.dados ?? []).filter((p) => p.estado === 'pendente').length,
      tom: 'bg-equipe text-white',
    },
  }

  const secao = SECOES[aba]

  return (
    <div className="grid h-full grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-r bg-card" aria-label="Seções da equipe">
        <nav className="rolagem flex min-h-0 flex-1 flex-col gap-5 px-3 py-5">
          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="mb-1 px-3 text-sm font-semibold text-muted-foreground">{grupo.titulo}</p>
              <ul className="flex flex-col gap-0.5">
                {grupo.abas.map((id) => {
                  const item = SECOES[id]
                  const Icone = item.icone
                  const ativa = aba === id
                  const contador = contadores[id]
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => abrirAba(id)}
                        aria-current={ativa ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[0.95rem] font-medium transition-colors',
                          ativa ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-muted',
                        )}
                      >
                        <Icone className="size-4 shrink-0" aria-hidden />
                        <span className="flex-1">{item.nome}</span>
                        {contador && contador.valor > 0 && (
                          <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold', contador.tom)}>
                            {contador.valor}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <label className="flex flex-col gap-1.5 border-t px-5 py-4 text-sm text-muted-foreground">
          Você está como
          <Selecao
            value={atuando?.id ?? ''}
            onChange={(e) => escolherAtuando(e.target.value)}
            disabled={equipe.length === 0}
            className="w-full"
          >
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({PAPEL[p.papel]})
              </option>
            ))}
          </Selecao>
        </label>
      </aside>

      <main className="rolagem min-h-0 bg-background" aria-label={secao.titulo}>
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
          <header>
            <h1 className="font-serif text-[1.75rem] leading-tight font-semibold">{secao.titulo}</h1>
            <p className="mt-1 text-[0.95rem] text-muted-foreground">{secao.descricao}</p>
          </header>
          {secao.conteudo()}
        </div>
      </main>
    </div>
  )
}
