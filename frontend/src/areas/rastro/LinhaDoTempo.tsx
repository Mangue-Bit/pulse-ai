import { useEffect, useMemo, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronDown, Cog, ListTree, ShieldCheck, User, Wrench, type LucideIcon } from 'lucide-react'

import type { Ator, Evento } from '@/api'
import { ChipDeEtapa, Etiqueta, Vazio } from '@/componentes/basicos'
import { CLASSES, corDoEvento, nomeDaEtapa, ROTULO_DO_ATOR, travessia } from '@/fluxo'
import { dolares, horaComSegundos, milissegundos, nomeDoCampo, valorLegivel } from '@/lib/formato'
import { cn } from '@/lib/utils'

const ICONE_DO_ATOR: Record<Ator, LucideIcon> = {
  regra: Cog,
  modelo: Bot,
  pessoa: User,
  ferramenta: Wrench,
}

const TITULO_DA_INTERACAO: Record<string, string> = {
  E01: 'Mensagem do paciente',
  C01: 'Risco de abandono sinalizado',
  C02: 'Registro do ACS',
  C03: 'Checagem por tempo',
  C23: 'Decisão da equipe',
  C25: 'Proposta sem resposta',
  C34: 'Registro do resultado',
  C36: 'Registro do resultado',
  U02: 'Alerta à equipe',
  U03: 'Trilha de urgência',
  U04: 'Trilha de urgência',
  U05: 'Trilha de urgência',
  C07: 'Fila do profissional',
}

interface Grupo {
  chave: string
  eventos: { evento: Evento; anterior: Evento | null }[]
}

function agrupar(eventos: Evento[]): Grupo[] {
  const grupos: Grupo[] = []
  eventos.forEach((evento, indice) => {
    const chave = evento.interacao_id ?? `sem-interacao-${evento.id}`
    const ultimo = grupos[grupos.length - 1]
    const item = { evento, anterior: indice > 0 ? eventos[indice - 1] : null }
    if (ultimo && ultimo.chave === chave) ultimo.eventos.push(item)
    else grupos.push({ chave, eventos: [item] })
  })
  return grupos
}

function Campos({ titulo, dados }: { titulo: string; dados: Record<string, unknown> }) {
  const entradas = Object.entries(dados).filter(([chave]) => chave !== 'resumo')
  if (entradas.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{titulo}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.82rem]">
        {entradas.map(([chave, valor]) => (
          <div key={chave} className="contents">
            <dt className="text-muted-foreground">{nomeDoCampo(chave)}</dt>
            <dd className="min-w-0 break-words whitespace-pre-wrap">{valorLegivel(valor)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function LinhaDeEvento({ evento, ultimo }: { evento: Evento; ultimo: boolean }) {
  const [aberto, setAberto] = useState(false)
  const cor = corDoEvento(evento)
  const classes = CLASSES[cor]
  const Icone = ICONE_DO_ATOR[evento.ator]
  const resumo = typeof evento.saida.resumo === 'string' ? evento.saida.resumo : null
  const decisao = typeof evento.saida.decisao === 'string' ? evento.saida.decisao : null
  const falhou = evento.saida.chamada === 'falhou'
  const temDetalhe =
    Object.keys(evento.entrada).length > 0 || Object.keys(evento.saida).some((chave) => chave !== 'resumo')

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="relative pl-6"
    >
      <span className={cn('absolute top-2 left-[5px] size-2.5 rounded-full ring-4 ring-card', classes.cheio)} />
      {ultimo && (
        <motion.span
          className={cn('absolute top-2 left-[5px] size-2.5 rounded-full', classes.cheio)}
          initial={{ opacity: 0.7, scale: 1 }}
          animate={{ opacity: 0, scale: 3.2 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      )}
      <button
        type="button"
        onClick={() => temDetalhe && setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cn(
          'w-full rounded-lg px-2 py-1.5 text-left transition-colors',
          temDetalhe && 'hover:bg-muted/70',
          aberto && 'bg-muted/70',
        )}
      >
        <div className="flex items-center gap-2">
          <ChipDeEtapa id={evento.etapa} cor={cor} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nomeDaEtapa(evento.etapa)}</span>
          {decisao && (
            <span className={cn('rounded px-1.5 text-xs font-bold', classes.suave, classes.texto)}>{decisao}</span>
          )}
          {temDetalhe && (
            <ChevronDown
              className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-180')}
              aria-hidden
            />
          )}
        </div>
        {resumo && <p className="mt-1 text-[0.87rem] leading-snug text-foreground/85">{resumo}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium">
            <Icone className="size-3" aria-hidden />
            {ROTULO_DO_ATOR[evento.ator]}
          </span>
          {evento.modelo && <span>{evento.modelo}</span>}
          {evento.versao_prompt && <span>{evento.versao_prompt}</span>}
          {evento.latencia_ms !== null && <span>{milissegundos(evento.latencia_ms)}</span>}
          {evento.tokens_entrada !== null && (
            <span>
              {evento.tokens_entrada} + {evento.tokens_saida ?? 0} tokens
            </span>
          )}
          {evento.custo !== null && evento.custo > 0 && <span>{dolares(evento.custo)}</span>}
          {falhou && <Etiqueta cor="urgencia">chamada falhou: caminho humano</Etiqueta>}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="mx-2 mb-2 flex flex-col gap-2.5 rounded-lg border bg-card p-2.5">
              <Campos titulo="Entrada" dados={evento.entrada} />
              <Campos titulo="Saída" dados={evento.saida} />
              <p className="text-xs text-muted-foreground">
                Registrado às {horaComSegundos(evento.criado_em)}, evento {evento.id}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

function Fronteira({ texto }: { texto: string }) {
  return (
    <motion.li
      initial={{ opacity: 0, scaleX: 0.6 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.3 }}
      className="relative my-1.5 flex items-center gap-2 pl-6"
      aria-label={texto}
    >
      <span className="h-px flex-1 border-t-2 border-dashed border-foreground/35" />
      <span className="inline-flex items-center gap-1 rounded-full border border-foreground/30 bg-card px-2 py-0.5 text-[0.72rem] font-semibold text-foreground/80">
        <ShieldCheck className="size-3" aria-hidden />
        {texto}
      </span>
      <span className="h-px w-3 border-t-2 border-dashed border-foreground/35" />
    </motion.li>
  )
}

export function LinhaDoTempo({ eventos, vazio }: { eventos: Evento[]; vazio: string }) {
  const grupos = useMemo(() => agrupar(eventos), [eventos])
  const fim = useRef<HTMLDivElement>(null)
  const quantidade = eventos.length

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [quantidade])

  if (quantidade === 0) {
    return (
      <Vazio icone={ListTree} titulo="Nenhuma etapa registrada">
        {vazio}
      </Vazio>
    )
  }

  const ultimoId = eventos[quantidade - 1].id

  return (
    <div className="flex flex-col gap-3 px-3 py-3">
      {grupos.map((grupo) => {
        const primeiro = grupo.eventos[0].evento
        return (
          <section key={`${grupo.chave}-${primeiro.id}`}>
            <header className="mb-1 flex items-baseline justify-between gap-2 px-1">
              <h3 className="text-[0.8rem] font-bold text-foreground/80">
                {TITULO_DA_INTERACAO[primeiro.etapa] ?? nomeDaEtapa(primeiro.etapa)}
              </h3>
              <time className="text-xs text-muted-foreground">{horaComSegundos(primeiro.criado_em)}</time>
            </header>
            <ol className="relative flex flex-col before:absolute before:top-2 before:bottom-2 before:left-[9px] before:w-0.5 before:rounded before:bg-border">
              {grupo.eventos.map(({ evento, anterior }) => {
                const cruzou = anterior ? travessia(anterior.etapa, evento.etapa) : null
                return (
                  <div key={evento.id} className="contents">
                    {cruzou && <Fronteira texto={cruzou} />}
                    <LinhaDeEvento evento={evento} ultimo={evento.id === ultimoId} />
                  </div>
                )
              })}
            </ol>
          </section>
        )
      })}
      <div ref={fim} />
    </div>
  )
}
