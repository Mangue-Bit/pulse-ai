import type { ReactNode } from 'react'

import { useEstado, type AbaEquipe } from '@/estado'
import { cn } from '@/lib/utils'

import { AbaAcs } from './AbaAcs'
import { AbaAlertas } from './AbaAlertas'
import { AbaAprovacoes } from './AbaAprovacoes'
import { AbaCasos } from './AbaCasos'
import { AbaDuvidas } from './AbaDuvidas'
import { AbaGestor, AbaRelatorios, AbaTerritorio } from './AbasDeVisao'

const CONTEUDO: Record<AbaEquipe, () => ReactNode> = {
  alertas: () => <AbaAlertas />,
  duvidas: () => <AbaDuvidas />,
  aprovacoes: () => <AbaAprovacoes />,
  casos: () => <AbaCasos />,
  acs: () => <AbaAcs />,
  territorio: () => <AbaTerritorio />,
  relatorios: () => <AbaRelatorios />,
  gestor: () => <AbaGestor />,
}

export function AreaEquipe() {
  const { aba, abrirAba, alertas, duvidas, propostas, casos } = useEstado()

  const abas: { id: AbaEquipe; nome: string; contador?: number; tom?: string }[] = [
    {
      id: 'alertas',
      nome: 'Alertas',
      contador: (alertas.dados ?? []).filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica').length,
      tom: 'bg-urgencia text-white',
    },
    {
      id: 'duvidas',
      nome: 'Dúvidas',
      contador: (duvidas.dados ?? []).filter((d) => d.status !== 'respondida').length,
      tom: 'bg-equipe text-white',
    },
    {
      id: 'aprovacoes',
      nome: 'Aprovações',
      contador: (propostas.dados ?? []).filter((p) => p.estado === 'pendente').length,
      tom: 'bg-equipe text-white',
    },
    {
      id: 'casos',
      nome: 'Casos',
      contador: (casos.dados ?? []).filter((c) => c.status !== 'resolvido' && c.status !== 'busca_ativa').length,
      tom: 'bg-muted text-foreground',
    },
    { id: 'acs', nome: 'ACS' },
    { id: 'territorio', nome: 'Território' },
    { id: 'relatorios', nome: 'Relatórios' },
    { id: 'gestor', nome: 'Gestor' },
  ]

  return (
    <main className="flex min-h-0 min-w-0 flex-col" aria-label="Equipe de saúde">
      <nav className="flex items-end border-b bg-card px-2 pt-2" aria-label="Abas da equipe">
        {abas.map((item) => {
          const ativa = aba === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => abrirAba(item.id)}
              aria-current={ativa ? 'page' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-t-lg border-b-[3px] px-2 pt-1.5 pb-2 text-[0.92rem] font-semibold whitespace-nowrap transition-colors',
                ativa
                  ? 'border-primary bg-background text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.nome}
              {item.contador !== undefined && item.contador > 0 && (
                <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold', item.tom)}>
                  {item.contador}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="rolagem min-h-0 flex-1 px-4 py-4">{CONTEUDO[aba]()}</div>
    </main>
  )
}
