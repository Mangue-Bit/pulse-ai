import { ChevronRight, ShieldAlert } from 'lucide-react'

import { porcento } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { sinaisDeAtencao, type Visita } from './visitas'

const plural = (quantidade: number, um: string, varios: string) => `${quantidade} ${quantidade === 1 ? um : varios}`

function CartaoDeRisco({ visita, aberta, aoAbrir }: { visita: Visita; aberta: boolean; aoAbrir: () => void }) {
  const { paciente } = visita
  const sinais = sinaisDeAtencao(visita)
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-current={aberta ? 'true' : undefined}
      className={cn(
        'flex min-h-18 w-full items-center gap-3 rounded-2xl border-2 bg-card px-3.5 py-3 text-left active:bg-muted',
        aberta ? 'border-marca bg-marca-suave' : 'border-transparent shadow-[0_0_0_1px_var(--border)]',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-lg leading-tight font-bold">{paciente.nome}</span>
          <span className={cn('shrink-0 font-display text-lg font-bold', paciente.alto_risco ? 'text-equipe' : 'text-foreground/70')}>
            {porcento(paciente.risco_abandono)}
          </span>
        </span>
        <span className="mt-1.5 block h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <span
            className={cn('block h-full rounded-full', paciente.alto_risco ? 'bg-equipe' : 'bg-lateral')}
            style={{ width: `${Math.round(paciente.risco_abandono * 100)}%` }}
          />
        </span>
        <span className="mt-1.5 block leading-snug text-foreground/80">
          {sinais.length > 0 ? sinais.join(' · ') : 'Sem outro sinal de atenção'}
        </span>
      </span>
      <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

function Grupo({ titulo, visitas, aberta, aoAbrir }: { titulo: string; visitas: Visita[]; aberta: string | null; aoAbrir: (id: string) => void }) {
  if (visitas.length === 0) return null
  return (
    <section aria-label={titulo}>
      <h3 className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
        {titulo} · {visitas.length}
      </h3>
      <ul className="flex flex-col gap-2.5">
        {visitas.map((visita) => (
          <li key={visita.paciente.id}>
            <CartaoDeRisco visita={visita} aberta={visita.paciente.id === aberta} aoAbrir={() => aoAbrir(visita.paciente.id)} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function PainelDeRisco({ visitas, aberta, aoAbrir }: { visitas: Visita[]; aberta: string | null; aoAbrir: (id: string) => void }) {
  const porRisco = [...visitas].sort((a, b) => b.paciente.risco_abandono - a.paciente.risco_abandono)
  const altos = porRisco.filter((visita) => visita.paciente.alto_risco)
  const demais = porRisco.filter((visita) => !visita.paciente.alto_risco)
  const total = visitas.length

  return (
    <>
      <header>
        <h2 className="text-2xl leading-tight font-bold tracking-tight">Risco na sua área</h2>
        <p className="mt-0.5 leading-snug text-foreground/80">
          Chance de cada paciente parar o tratamento. O Pulse mostra por onde começar. Quem decide a visita é você.
        </p>
      </header>

      {total > 0 && (
        <section className="rounded-2xl border bg-card p-3.5" aria-label="Resumo do risco">
          <p className="flex items-center gap-2 text-lg leading-tight font-bold">
            <ShieldAlert className="size-5 shrink-0 text-equipe" aria-hidden />
            {plural(altos.length, 'paciente em alto risco', 'pacientes em alto risco')} de {total}
          </p>
          <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className="bg-equipe" style={{ width: `${(altos.length / total) * 100}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-equipe" aria-hidden />
              Alto risco: {altos.length}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-secondary shadow-[0_0_0_1px_var(--input)]" aria-hidden />
              Acompanhamento habitual: {demais.length}
            </span>
          </p>
        </section>
      )}

      <Grupo titulo="Atenção primeiro" visitas={altos} aberta={aberta} aoAbrir={aoAbrir} />
      <Grupo titulo="Acompanhamento habitual" visitas={demais} aberta={aberta} aoAbrir={aoAbrir} />
    </>
  )
}
