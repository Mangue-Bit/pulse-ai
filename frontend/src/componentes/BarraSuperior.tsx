import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Clock, MessageCircle, RotateCcw, Route, Stethoscope, WifiOff, type LucideIcon } from 'lucide-react'

import { api, type Disparo } from '@/api'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/componentes/ui/alert-dialog'
import { Button } from '@/componentes/ui/button'
import { useEstado, type Tela } from '@/estado'
import { diaDaSemana, hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

const AVANCOS = [
  { minutos: 15, nome: '+15 min' },
  { minutos: 60, nome: '+1 hora' },
  { minutos: 60 * 24, nome: '+1 dia' },
]

function Marca() {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 34 24" className="h-6 w-8" aria-hidden>
        <path
          d="M1 13h7l3-9 5 17 4-12 2 4h11"
          fill="none"
          stroke="var(--urgencia)"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="font-serif text-[1.5rem] leading-none font-semibold tracking-tight">Pulse</span>
    </div>
  )
}

function ItemDeNavegacao({
  tela,
  nome,
  icone: Icone,
  contador,
  urgente,
}: {
  tela: Tela
  nome: string
  icone: LucideIcon
  contador?: number
  urgente?: boolean
}) {
  const { tela: atual, irPara } = useEstado()
  const ativa = atual === tela
  return (
    <button
      type="button"
      onClick={() => irPara(tela)}
      aria-current={ativa ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-2 rounded-full px-4 text-[0.95rem] font-semibold transition-colors',
        ativa ? 'bg-primary text-primary-foreground' : 'text-foreground/70 hover:bg-muted hover:text-foreground',
      )}
    >
      <Icone className="size-4" aria-hidden />
      {nome}
      {contador !== undefined && contador > 0 && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold text-white',
            urgente ? 'bg-urgencia' : 'bg-equipe',
          )}
        >
          {contador}
        </span>
      )}
    </button>
  )
}

/** Painel que abre abaixo de um botão e fecha com clique fora ou Esc. */
function Suspenso({ aberto, aoFechar, children }: { aberto: boolean; aoFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) aoFechar()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto, aoFechar])
  if (!aberto) return null
  return (
    <div ref={ref} className="absolute top-[calc(100%+8px)] right-0 z-30 w-72 rounded-2xl border bg-popover p-4 shadow-xl">
      {children}
    </div>
  )
}

export function BarraSuperior() {
  const { conectado, relogio, agora, alertas, duvidas, propostas, recarregarTudo, mostrarRastro } = useEstado()
  const [menu, setMenu] = useState(false)
  const [avancando, setAvancando] = useState(false)
  const [disparos, setDisparos] = useState<Disparo[] | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)

  const avancar = async (minutos: number) => {
    setAvancando(true)
    try {
      const resposta = await api.avancarRelogio(minutos)
      setDisparos(resposta.disparos ?? [])
      await relogio.recarregar()
      recarregarTudo()
      window.setTimeout(() => setDisparos(null), 6000)
    } catch {
      setDisparos([{ tipo: 'erro', descricao: 'O relógio não avançou: sem conexão com o serviço.' }])
    } finally {
      setAvancando(false)
    }
  }

  const reiniciar = async () => {
    setReiniciando(true)
    try {
      await api.reiniciarDemonstracao()
      mostrarRastro({ tipo: 'paciente' })
      await relogio.recarregar()
      recarregarTudo()
      setConfirmando(false)
    } catch {
      setDisparos([{ tipo: 'erro', descricao: 'A demonstração não foi reiniciada: sem conexão com o serviço.' }])
      setConfirmando(false)
    } finally {
      setReiniciando(false)
    }
  }

  const alertasAbertos = (alertas.dados ?? []).filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica').length
  const duvidasAbertas = (duvidas.dados ?? []).filter((d) => d.status !== 'respondida').length
  const pendentes = (propostas.dados ?? []).filter((p) => p.estado === 'pendente').length

  return (
    <header className="relative z-20 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-card px-5">
      <Marca />

      <nav className="flex items-center gap-1 rounded-full bg-background p-1" aria-label="Telas do Pulse">
        <ItemDeNavegacao tela="paciente" nome="Paciente" icone={MessageCircle} />
        <ItemDeNavegacao
          tela="equipe"
          nome="Equipe"
          icone={Stethoscope}
          contador={alertasAbertos + duvidasAbertas + pendentes}
          urgente={alertasAbertos > 0}
        />
        <ItemDeNavegacao tela="rastro" nome="Rastro" icone={Route} />
      </nav>

      <div className="flex items-center justify-end gap-2">
        {!conectado && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-urgencia-suave px-3 py-1 text-sm font-semibold text-urgencia">
            <WifiOff className="size-4" aria-hidden />
            Sem conexão
          </span>
        )}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            aria-expanded={menu}
            aria-label="Relógio e controles da demonstração"
            className="flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold hover:bg-muted aria-expanded:bg-muted"
          >
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <span className="tabular-nums">{hora(agora)}</span>
            <span className="font-normal text-muted-foreground">{diaDaSemana(agora)}</span>
          </button>
          <Suspenso aberto={menu} aoFechar={() => setMenu(false)}>
            <p className="font-semibold">Avançar o relógio</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Faça os prazos vencerem sem esperar.</p>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {AVANCOS.map((avanco) => (
                <Button
                  key={avanco.minutos}
                  variant="outline"
                  disabled={avancando || !conectado}
                  onClick={() => void avancar(avanco.minutos)}
                >
                  {avanco.nome}
                </Button>
              ))}
            </div>
            <div className="mt-4 border-t pt-3">
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground"
                disabled={!conectado}
                onClick={() => {
                  setMenu(false)
                  setConfirmando(true)
                }}
              >
                <RotateCcw data-icon="inline-start" />
                Recomeçar a demonstração
              </Button>
            </div>
          </Suspenso>
        </div>
      </div>

      {disparos && (
        <div
          role="status"
          className="absolute top-[calc(100%+8px)] right-5 z-20 max-w-sm rounded-xl border bg-popover px-4 py-3 text-sm shadow-lg"
        >
          {disparos.length === 0 ? (
            <p className="text-muted-foreground">Relógio avançado. Nenhum prazo venceu.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {disparos.map((disparo, indice) => (
                <li key={`${disparo.tipo}-${indice}`} className="leading-snug">
                  {disparo.descricao}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recomeçar a demonstração?</AlertDialogTitle>
            <AlertDialogDescription>
              Conversas, casos e decisões desta sessão são apagados, os pacientes de exemplo voltam ao estado inicial e o
              relógio volta à hora real.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reiniciando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={reiniciando} onClick={() => void reiniciar()}>
              Recomeçar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
