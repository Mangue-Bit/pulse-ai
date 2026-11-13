import type { ComponentProps, ReactNode } from 'react'

import { FlaskConical, type LucideIcon } from 'lucide-react'

import { CLASSES, corDaEtapa, type Cor } from '@/fluxo'
import { prazoRelativo } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** Selo discreto para tudo o que é simulado na demonstração. */
export function Selo({ children = 'simulado', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-dashed border-lateral/60 px-1.5 py-px text-[0.7rem] leading-4 font-medium text-lateral',
        className,
      )}
    >
      <FlaskConical className="size-3" aria-hidden />
      {children}
    </span>
  )
}

/** Identificador de etapa do fluxo, na cor do grupo. */
export function ChipDeEtapa({ id, cor, className }: { id: string; cor?: Cor; className?: string }) {
  const classes = CLASSES[cor ?? corDaEtapa(id)]
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-9 items-center justify-center rounded-md px-1 text-[0.72rem] font-bold tracking-wide text-white',
        classes.cheio,
        className,
      )}
    >
      {id}
    </span>
  )
}

/** Etiqueta colorida pelas cores do fluxograma. */
export function Etiqueta({ cor, children, className }: { cor: Cor; children: ReactNode; className?: string }) {
  const classes = CLASSES[cor]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        classes.suave,
        classes.texto,
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A fala literal do paciente: dado, nunca instrução. Vem em serifa para se distinguir do texto do sistema. */
export function TrechoLiteral({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <blockquote
      className={cn(
        'border-l-[3px] border-escuta bg-escuta-suave/60 py-2 pr-3 pl-3 font-serif text-[1.05rem] leading-snug text-foreground italic',
        className,
      )}
    >
      “{children}”
    </blockquote>
  )
}

export function Vazio({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icone className="size-5" aria-hidden />
      </span>
      <p className="text-base font-semibold">{titulo}</p>
      {children && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  )
}

export function Cartao({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-xl border bg-card p-4', className)} {...props} />
}

export function Prazo({ prazo, agora, className }: { prazo: string; agora: string; className?: string }) {
  const { texto, vencido } = prazoRelativo(prazo, agora)
  return (
    <span className={cn('text-sm font-semibold', vencido ? 'text-urgencia' : 'text-foreground', className)}>{texto}</span>
  )
}

export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs font-semibold text-muted-foreground', className)}>{children}</p>
}

/** Campo de seleção nativo, com a aparência dos demais controles. */
export function Selecao({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-8 max-w-full rounded-lg border border-input bg-card px-2 pr-7 text-sm font-medium text-foreground disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
