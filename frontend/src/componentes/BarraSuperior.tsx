import { useEffect, useRef, useState, type ReactNode } from 'react'

import { Clock, RotateCcw, WifiOff } from 'lucide-react'

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
import { useEstado } from '@/estado'
import { diaDaSemana, hora } from '@/lib/formato'

const AVANCOS = [
  { minutos: 15, nome: '+15 min' },
  { minutos: 60, nome: '+1 hora' },
  { minutos: 60 * 24, nome: '+1 dia' },
]

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
    <div ref={ref} className="absolute top-[calc(100%+8px)] right-0 z-30 w-72 rounded-md border bg-popover p-4 shadow-md">
      {children}
    </div>
  )
}

export function BarraSuperior() {
  const { conectado, relogio, agora, recarregarTudo, reiniciarDemonstracao } = useEstado()
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
      await reiniciarDemonstracao()
      setConfirmando(false)
    } catch {
      setDisparos([{ tipo: 'erro', descricao: 'A demonstração não foi reiniciada: sem conexão com o serviço.' }])
      setConfirmando(false)
    } finally {
      setReiniciando(false)
    }
  }

  return (
    <header className="topo">
      <p className="topo-local">Demonstração com pacientes fictícios</p>

      <div className="ml-auto flex items-center gap-2">
        {!conectado && (
          <span className="topo-conexao inline-flex items-center gap-1.5 rounded-md bg-urgencia-suave px-2.5 py-1 text-sm font-semibold text-urgencia">
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
            className="flex h-8 items-center gap-2 rounded-md border bg-card px-2.5 text-sm font-medium hover:bg-muted aria-expanded:bg-muted"
          >
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <span className="tabular-nums">{hora(agora)}</span>
            <span className="hidden font-normal text-muted-foreground xl:inline">{diaDaSemana(agora)}</span>
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
          className="absolute top-[calc(100%+8px)] right-5 z-20 max-w-sm rounded-md border bg-popover px-4 py-3 text-sm shadow-md"
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
