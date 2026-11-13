import { useState } from 'react'

import { Pause, Play, Radio, RotateCcw, WifiOff } from 'lucide-react'

import { Selecao, Selo } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { RASTRO_DE_EXEMPLO, TITULO_DA_GRAVACAO } from '@/dados/rastro-exemplo'
import { useEstado } from '@/estado'
import { BARREIRA, rotulo } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { Indicadores } from './Indicadores'
import { LinhaDoTempo } from './LinhaDoTempo'
import { MapaDoFluxo } from './MapaDoFluxo'
import { useRastro } from './useRastro'

type Aba = 'linha' | 'mapa' | 'indicadores'

const ABAS: { id: Aba; nome: string }[] = [
  { id: 'linha', nome: 'Linha do tempo' },
  { id: 'mapa', nome: 'Mapa do fluxo' },
  { id: 'indicadores', nome: 'Indicadores' },
]

const VELOCIDADES = [1, 2, 4]

export function AreaRastro() {
  const { rastro: origem, mostrarRastro, paciente, conectado, casos } = useEstado()
  const [aba, setAba] = useState<Aba>('linha')
  const rastro = useRastro(origem, paciente?.id ?? null, conectado)

  const aoVivo = origem.tipo === 'paciente'
  const titulo =
    origem.tipo === 'paciente'
      ? paciente
        ? `Ao vivo: ${paciente.nome}`
        : 'Ao vivo'
      : origem.titulo

  const escolherReproducao = (valor: string) => {
    if (valor === 'exemplo') {
      mostrarRastro({ tipo: 'gravacao', titulo: TITULO_DA_GRAVACAO, eventos: RASTRO_DE_EXEMPLO })
    } else if (valor) {
      const caso = casos.dados?.find((c) => c.caso_id === valor)
      if (!caso) return
      mostrarRastro({
        tipo: 'caso',
        casoId: caso.caso_id,
        titulo: `Caso de ${caso.paciente_nome}`,
        reproduzir: true,
      })
    }
    setAba((atual) => (atual === 'indicadores' ? 'linha' : atual))
  }

  const semDados = aoVivo && rastro.semConexao

  return (
    <aside className="flex min-h-0 flex-col border-l bg-card" aria-label="Rastro do caso">
      <header className="flex flex-col gap-2 border-b px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-full',
              aoVivo ? 'bg-concluido-suave text-concluido' : 'bg-muted text-muted-foreground',
            )}
          >
            {semDados ? <WifiOff className="size-3.5" /> : <Radio className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm leading-tight font-bold">{titulo}</h2>
            <p className="text-xs text-muted-foreground">
              {origem.tipo === 'gravacao' && 'Gravação com dados sintéticos'}
              {origem.tipo === 'caso' && 'Rastro gravado do caso'}
              {origem.tipo === 'paciente' && (semDados ? 'Sem conexão com o serviço' : 'Etapas registradas em tempo real')}
            </p>
          </div>
          {origem.tipo === 'gravacao' && <Selo>gravação</Selo>}
          {!aoVivo && (
            <Button variant="outline" size="sm" onClick={() => mostrarRastro({ tipo: 'paciente' })}>
              Voltar ao vivo
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Selecao
            aria-label="Reproduzir um rastro gravado"
            value=""
            onChange={(e) => escolherReproducao(e.target.value)}
            className="min-w-0 flex-1 text-[0.82rem]"
          >
            <option value="">Reproduzir um rastro gravado</option>
            <option value="exemplo">Gravação de exemplo: relato de barreira</option>
            {(casos.dados ?? []).map((caso) => (
              <option key={caso.caso_id} value={caso.caso_id}>
                {caso.paciente_nome}: {rotulo(BARREIRA, caso.barreira).toLowerCase()}
              </option>
            ))}
          </Selecao>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={rastro.reproduzirDoInicio}
            disabled={rastro.total === 0}
            aria-label="Reproduzir do início"
            title="Reproduzir do início"
          >
            <RotateCcw />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={rastro.alternarPausa}
            disabled={!rastro.reproduzindo}
            aria-label={rastro.pausado ? 'Continuar' : 'Pausar'}
            title={rastro.pausado ? 'Continuar' : 'Pausar'}
          >
            {rastro.pausado ? <Play /> : <Pause />}
          </Button>
          <div className="flex overflow-hidden rounded-lg border" role="group" aria-label="Velocidade da reprodução">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => rastro.definirVelocidade(v)}
                aria-pressed={rastro.velocidade === v}
                className={cn(
                  'h-7 px-1.5 text-xs font-semibold',
                  rastro.velocidade === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {v}×
              </button>
            ))}
          </div>
        </div>

        <nav className="-mb-2 flex gap-4" aria-label="Visões do rastro">
          {ABAS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              aria-current={aba === item.id}
              className={cn(
                'border-b-2 pt-1 pb-1.5 text-sm font-semibold transition-colors',
                aba === item.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {item.nome}
            </button>
          ))}
        </nav>
      </header>

      <div className="rolagem min-h-0 flex-1 bg-background/50">
        {aba === 'linha' &&
          (semDados ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <WifiOff className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-base font-semibold">Sem conexão com o serviço</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                O rastro ao vivo volta quando o serviço responder. Enquanto isso, a gravação de exemplo mostra o fluxo
                completo de um relato de barreira.
              </p>
              <Button onClick={() => escolherReproducao('exemplo')}>
                <Play data-icon="inline-start" />
                Reproduzir a gravação de exemplo
              </Button>
            </div>
          ) : (
            <LinhaDoTempo
              eventos={rastro.visiveis}
              vazio={
                aoVivo
                  ? 'Envie uma mensagem pelo chat do paciente. Cada etapa do fluxo aparece aqui assim que registra um evento.'
                  : 'Este rastro não tem eventos gravados.'
              }
            />
          ))}
        {aba === 'mapa' && <MapaDoFluxo eventos={rastro.visiveis} />}
        {aba === 'indicadores' && <Indicadores />}
      </div>
    </aside>
  )
}
