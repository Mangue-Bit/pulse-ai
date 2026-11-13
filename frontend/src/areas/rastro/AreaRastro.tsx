import { useState } from 'react'

import { Pause, Play, Radio, RotateCcw, WifiOff } from 'lucide-react'

import { Selecao } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { RASTRO_DE_EXEMPLO, TITULO_DA_GRAVACAO } from '@/dados/rastro-exemplo'
import { useEstado } from '@/estado'
import { BARREIRA, rotulo } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { Indicadores } from './Indicadores'
import { LinhaDoTempo } from './LinhaDoTempo'
import { MapaDoFluxo } from './MapaDoFluxo'
import { useRastro } from './useRastro'

type Visao = 'passos' | 'indicadores'

const VISOES: { id: Visao; nome: string }[] = [
  { id: 'passos', nome: 'Passo a passo' },
  { id: 'indicadores', nome: 'Indicadores' },
]

const VELOCIDADES = [1, 2, 4]

function Segmentos<T extends string | number>({
  opcoes,
  valor,
  aoEscolher,
  rotuloDoGrupo,
}: {
  opcoes: { id: T; nome: string }[]
  valor: T
  aoEscolher: (id: T) => void
  rotuloDoGrupo: string
}) {
  return (
    <div className="flex rounded-full bg-muted p-0.5" role="group" aria-label={rotuloDoGrupo}>
      {opcoes.map((opcao) => (
        <button
          key={opcao.id}
          type="button"
          onClick={() => aoEscolher(opcao.id)}
          aria-pressed={valor === opcao.id}
          className={cn(
            'h-8 rounded-full px-3.5 text-sm font-semibold transition-colors',
            valor === opcao.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opcao.nome}
        </button>
      ))}
    </div>
  )
}

export function AreaRastro() {
  const { rastro: origem, mostrarRastro, paciente, pacientes, escolherPaciente, conectado, casos } = useEstado()
  const [visao, setVisao] = useState<Visao>('passos')
  const rastro = useRastro(origem, paciente?.id ?? null, conectado)

  const aoVivo = origem.tipo === 'paciente'
  const semDados = aoVivo && rastro.semConexao

  const reproduzir = (valor: string) => {
    if (valor === 'exemplo') {
      mostrarRastro({ tipo: 'gravacao', titulo: TITULO_DA_GRAVACAO, eventos: RASTRO_DE_EXEMPLO })
    } else if (valor) {
      const caso = casos.dados?.find((c) => c.caso_id === valor)
      if (!caso) return
      mostrarRastro({ tipo: 'caso', casoId: caso.caso_id, titulo: `Caso de ${caso.paciente_nome}`, reproduzir: true })
    }
    setVisao('passos')
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-3 border-b bg-card px-8 pt-6 pb-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[1.75rem] leading-tight font-semibold">Como o Pulse decidiu</h1>
          <p className="mt-1 text-[0.95rem] text-muted-foreground">
            Cada passo que o Pulse deu, na ordem em que aconteceu. Clique em um passo para ver os detalhes.
          </p>
        </div>
        <Segmentos opcoes={VISOES} valor={visao} aoEscolher={setVisao} rotuloDoGrupo="Visão" />
      </header>

      {visao === 'passos' && (
        <div className="flex flex-wrap items-center gap-3 border-b bg-card px-8 py-3">
          {aoVivo ? (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold',
                  semDados ? 'bg-muted text-muted-foreground' : 'bg-concluido-suave text-concluido',
                )}
              >
                {semDados ? <WifiOff className="size-3.5" aria-hidden /> : <Radio className="size-3.5" aria-hidden />}
                Ao vivo
              </span>
              <Selecao
                aria-label="Paciente acompanhado"
                value={paciente?.id ?? ''}
                onChange={(e) => escolherPaciente(e.target.value)}
                className="w-56"
              >
                {(pacientes.dados ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Selecao>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm font-semibold text-muted-foreground">
                <Play className="size-3.5" aria-hidden />
                Reprodução
              </span>
              <span className="font-semibold">{origem.titulo}</span>
              <Button variant="outline" size="sm" onClick={() => mostrarRastro({ tipo: 'paciente' })}>
                Voltar ao vivo
              </Button>
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Selecao
              aria-label="Reproduzir um caso"
              value=""
              onChange={(e) => reproduzir(e.target.value)}
              className="w-60"
            >
              <option value="">Reproduzir um caso…</option>
              <option value="exemplo">Exemplo completo</option>
              {(casos.dados ?? []).map((caso) => (
                <option key={caso.caso_id} value={caso.caso_id}>
                  {caso.paciente_nome}: {rotulo(BARREIRA, caso.barreira).toLowerCase()}
                </option>
              ))}
            </Selecao>
            {!aoVivo && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={rastro.reproduzirDoInicio}
                  disabled={rastro.total === 0}
                  aria-label="Reproduzir do início"
                  title="Reproduzir do início"
                >
                  <RotateCcw />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={rastro.alternarPausa}
                  disabled={!rastro.reproduzindo}
                  aria-label={rastro.pausado ? 'Continuar' : 'Pausar'}
                  title={rastro.pausado ? 'Continuar' : 'Pausar'}
                >
                  {rastro.pausado ? <Play /> : <Pause />}
                </Button>
                <Segmentos
                  opcoes={VELOCIDADES.map((v) => ({ id: v, nome: `${v}×` }))}
                  valor={rastro.velocidade}
                  aoEscolher={rastro.definirVelocidade}
                  rotuloDoGrupo="Velocidade da reprodução"
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 bg-background">
        {visao === 'indicadores' ? (
          <div className="rolagem h-full">
            <div className="mx-auto max-w-4xl px-8 py-6">
              <Indicadores />
            </div>
          </div>
        ) : semDados ? (
          <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
            <WifiOff className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-serif text-xl font-semibold">Sem conexão com o serviço</p>
            <p className="max-w-sm text-[0.95rem] leading-relaxed text-muted-foreground">
              Enquanto isso, veja um exemplo completo gravado.
            </p>
            <Button onClick={() => reproduzir('exemplo')}>
              <Play data-icon="inline-start" />
              Ver o exemplo
            </Button>
          </div>
        ) : (
          <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rolagem min-h-0">
              <div className="mx-auto max-w-3xl px-6 py-4">
                <LinhaDoTempo
                  eventos={rastro.visiveis}
                  vazio={
                    aoVivo
                      ? 'Envie uma mensagem na tela do Paciente. Cada passo aparece aqui enquanto acontece.'
                      : 'Este caso não tem passos gravados.'
                  }
                />
              </div>
            </div>
            <aside className="rolagem hidden min-h-0 border-l bg-card lg:block" aria-label="Mapa do fluxo">
              <MapaDoFluxo eventos={rastro.visiveis} />
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
