import { useState } from 'react'

import { Clock, FastForward, RotateCcw, WifiOff } from 'lucide-react'

import { api, type Disparo } from '@/api'
import { Selecao, Selo } from '@/componentes/basicos'
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
import { useEstado, type AbaEquipe } from '@/estado'
import { diaDaSemana, horaComSegundos, PAPEL, rotulo, SITUACAO } from '@/lib/formato'
import { cn } from '@/lib/utils'

const AVANCOS = [
  { minutos: 15, nome: '+15 min' },
  { minutos: 60, nome: '+1 h' },
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
      <span className="font-serif text-[1.45rem] leading-none font-semibold tracking-tight">Pulse</span>
    </div>
  )
}

function Indicador({ nome, valor, aba, tom }: { nome: string; valor: number; aba: AbaEquipe; tom: string }) {
  const { abrirAba } = useEstado()
  return (
    <button
      type="button"
      onClick={() => abrirAba(aba)}
      className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-sm hover:bg-muted"
      title={`Abrir ${nome.toLowerCase()}`}
    >
      <span className={cn('min-w-6 rounded-md px-1.5 text-center text-sm leading-6 font-bold', valor > 0 ? tom : 'bg-muted text-muted-foreground')}>
        {valor}
      </span>
      <span className="font-medium text-foreground/80">{nome}</span>
    </button>
  )
}

export function BarraSuperior() {
  const {
    saude,
    conectado,
    pacientes,
    paciente,
    escolherPaciente,
    equipe,
    atuando,
    escolherAtuando,
    relogio,
    agora,
    alertas,
    duvidas,
    propostas,
    recarregarTudo,
    mostrarRastro,
  } = useEstado()
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

  const abertos = (alertas.dados ?? []).filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica').length
  const duvidasAbertas = (duvidas.dados ?? []).filter((d) => d.status !== 'respondida').length
  const pendentes = (propostas.dados ?? []).filter((p) => p.estado === 'pendente').length

  return (
    <header className="relative flex h-[52px] shrink-0 items-center gap-2.5 border-b bg-card px-3 whitespace-nowrap">
      <Marca />

      <div className="flex items-center gap-1.5 border-l pl-3">
        <Clock className="size-4 text-muted-foreground" aria-hidden />
        <div className="leading-tight">
          <p className="text-[0.95rem] font-bold tabular-nums">{horaComSegundos(agora)}</p>
          <p className="text-[0.7rem] text-muted-foreground">{diaDaSemana(agora)}</p>
        </div>
        <div className="ml-1 flex overflow-hidden rounded-lg border" role="group" aria-label="Avançar o relógio do sistema">
          {AVANCOS.map((avanco) => (
            <button
              key={avanco.minutos}
              type="button"
              disabled={avancando || !conectado}
              onClick={() => void avancar(avanco.minutos)}
              className="flex h-7 items-center gap-1 border-l px-2 text-xs font-semibold first:border-l-0 hover:bg-muted disabled:opacity-50"
            >
              {avanco.minutos === 15 && <FastForward className="size-3" aria-hidden />}
              {avanco.nome}
            </button>
          ))}
        </div>
        <Selo>simulado</Selo>
      </div>

      <label className="flex min-w-0 items-center gap-1.5 border-l pl-2.5 text-xs font-semibold text-muted-foreground">
        Paciente
        <Selecao
          value={paciente?.id ?? ''}
          onChange={(e) => escolherPaciente(e.target.value)}
          disabled={!pacientes.dados?.length}
          className="w-40"
        >
          {(pacientes.dados ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
              {p.situacao !== 'ativo' ? ` (${rotulo(SITUACAO, p.situacao).toLowerCase()})` : ''}
              {!p.aceite_valido && p.situacao !== 'aceite_revogado' ? ' (sem aceite)' : ''}
            </option>
          ))}
        </Selecao>
      </label>

      <nav className="flex items-center border-l pl-2" aria-label="Filas da equipe">
        <Indicador nome="Alertas" valor={abertos} aba="alertas" tom="bg-urgencia text-white" />
        <Indicador nome="Dúvidas" valor={duvidasAbertas} aba="duvidas" tom="bg-equipe text-white" />
        <Indicador nome="Aprovações" valor={pendentes} aba="aprovacoes" tom="bg-equipe text-white" />
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-2">
        {!conectado && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            <WifiOff className="size-3.5" aria-hidden />
            sem conexão
          </span>
        )}
        {saude.dados?.modelo_simulado && <Selo>modelo simulado</Selo>}
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          Atuando como
          <Selecao
            value={atuando?.id ?? ''}
            onChange={(e) => escolherAtuando(e.target.value)}
            disabled={equipe.length === 0}
            className="w-36"
          >
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} ({PAPEL[p.papel]})
              </option>
            ))}
          </Selecao>
        </label>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setConfirmando(true)}
          disabled={!conectado}
          aria-label="Reiniciar demonstração"
          title="Reiniciar demonstração"
        >
          <RotateCcw />
        </Button>
      </div>

      {disparos && (
        <div
          role="status"
          className="absolute top-[56px] left-28 z-20 max-w-md rounded-lg border bg-popover px-3 py-2 text-sm shadow-lg"
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
            <AlertDialogTitle>Reiniciar a demonstração?</AlertDialogTitle>
            <AlertDialogDescription>
              As conversas, os casos, as propostas e o rastro criados nesta sessão são apagados, os dados sintéticos são
              recarregados e o relógio volta à hora real.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reiniciando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={reiniciando} onClick={() => void reiniciar()}>
              Reiniciar demonstração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
