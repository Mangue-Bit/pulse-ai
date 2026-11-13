import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { Maximize2 } from 'lucide-react'

import type { Evento } from '@/api'
import { Button } from '@/componentes/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/componentes/ui/dialog'
import {
  corDoEvento,
  ETAPA_POR_ID,
  ETAPAS,
  FAIXAS,
  ROTULO_DA_COR,
  VARIAVEL_DA_COR,
  VARIAVEL_SUAVE,
  type Cor,
  type Etapa,
} from '@/fluxo'

const COLUNA = 86
const LINHA = 52
const LARGURA_NO = 78
const ALTURA_NO = 36
const MARGEM = 14
const TOPO_DA_FAIXA = 24
const LARGURA = MARGEM * 2 + COLUNA * 4

/** Posição vertical: cada faixa ganha um título e os especialistas ganham folga para a caixa tracejada. */
function topoDaLinha(lin: number): number {
  const faixa = lin <= 3 ? 0 : lin <= 5 ? 1 : 2
  let y = 6 + lin * LINHA + (faixa + 1) * TOPO_DA_FAIXA + faixa * 14
  if (lin >= 10) y += 18
  if (lin >= 13) y += 10
  return y
}

const centro = (etapa: Etapa) => ({
  x: MARGEM + etapa.col * COLUNA + COLUNA / 2,
  y: topoDaLinha(etapa.lin) + ALTURA_NO / 2,
})

const ALTURA = topoDaLinha(19) + ALTURA_NO + 16

function abreviar(nome: string, limite = 19): string {
  return nome.length > limite ? `${nome.slice(0, limite - 1).trimEnd()}…` : nome
}

function caminho(de: Etapa, para: Etapa): { d: string; longo: boolean } {
  const a = centro(de)
  const b = centro(para)
  const longo = Math.abs(de.lin - para.lin) > 1 || (de.lin === para.lin && Math.abs(de.col - para.col) > 1)
  if (!longo) return { d: `M${a.x},${a.y} L${b.x},${b.y}`, longo }
  // Ligações longas contornam o mapa pela margem mais próxima.
  const pelaDireita = a.x + b.x > LARGURA
  const borda = pelaDireita ? LARGURA - 4 : 4
  return { d: `M${a.x},${a.y} C${borda},${a.y} ${borda},${b.y} ${b.x},${b.y}`, longo }
}

function Desenho({ percorridas, ultima }: { percorridas: Map<string, Cor>; ultima: string | null }) {
  const [emFoco, setEmFoco] = useState<string | null>(null)
  const ligacoes = useMemo(
    () =>
      ETAPAS.flatMap((de) =>
        de.saidas.map((idDestino) => {
          const para = ETAPA_POR_ID[idDestino]
          return { de, para, ...caminho(de, para) }
        }),
      ),
    [],
  )

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="block w-full" role="img" aria-label="Mapa do fluxo do Pulse">
        {FAIXAS.map((faixa) => {
          const y = topoDaLinha(faixa.de) - TOPO_DA_FAIXA + 2
          const altura = topoDaLinha(faixa.ate) + ALTURA_NO + 8 - y
          const cor = faixa.grupo as Cor
          return (
            <g key={faixa.grupo}>
              <rect x={2} y={y} width={LARGURA - 4} height={altura} rx={10} fill={VARIAVEL_SUAVE[cor]} opacity={0.45} />
              <text x={MARGEM} y={y + 15} fontSize={10.5} fontWeight={700} fill={VARIAVEL_DA_COR[cor]}>
                {faixa.titulo}
              </text>
            </g>
          )
        })}

        {/* Fronteira de permissão entre a trilha de urgência e o Cuidado */}
        <g>
          <line
            x1={2}
            x2={LARGURA - 2}
            y1={topoDaLinha(6) - TOPO_DA_FAIXA - 5}
            y2={topoDaLinha(6) - TOPO_DA_FAIXA - 5}
            stroke="var(--foreground)"
            strokeOpacity={0.55}
            strokeWidth={1.4}
            strokeDasharray="5 4"
          />
          <text
            x={LARGURA - MARGEM}
            y={topoDaLinha(6) - TOPO_DA_FAIXA - 9}
            textAnchor="end"
            fontSize={8.5}
            fontWeight={700}
            fill="var(--foreground)"
            fillOpacity={0.7}
          >
            fronteira de permissão
          </text>
        </g>

        {/* Agentes especialistas em caixa tracejada */}
        {(['Intervenção', 'Relatório', 'Território'] as const).map((nome, col) => (
          <g key={nome}>
            <rect
              x={MARGEM + col * COLUNA + 1}
              y={topoDaLinha(10) - 16}
              width={COLUNA - 2}
              height={topoDaLinha(12) + ALTURA_NO + 6 - (topoDaLinha(10) - 16)}
              rx={8}
              fill="var(--card)"
              fillOpacity={0.55}
              stroke="var(--cuidado)"
              strokeOpacity={0.6}
              strokeDasharray="4 3"
            />
            <text
              x={MARGEM + col * COLUNA + COLUNA / 2}
              y={topoDaLinha(10) - 5}
              textAnchor="middle"
              fontSize={8.5}
              fontWeight={700}
              fill="var(--cuidado)"
            >
              {nome}
            </text>
          </g>
        ))}

        {ligacoes.map(({ de, para, d, longo }) => {
          const acesa = percorridas.has(de.id) && percorridas.has(para.id)
          return (
            <path
              key={`${de.id}-${para.id}`}
              d={d}
              fill="none"
              stroke={acesa ? VARIAVEL_DA_COR[percorridas.get(para.id)!] : '#b9c1ce'}
              strokeWidth={acesa ? 2 : 1}
              strokeOpacity={acesa ? 0.95 : longo ? 0.4 : 0.8}
              strokeDasharray={longo ? '3 3' : undefined}
            />
          )
        })}

        {ETAPAS.map((etapa) => {
          const { x, y } = centro(etapa)
          const cor = percorridas.get(etapa.id)
          const acesa = cor !== undefined
          const traco = acesa ? VARIAVEL_DA_COR[cor] : '#c3cad6'
          const fundo = acesa ? VARIAVEL_SUAVE[cor] : 'var(--card)'
          const tinta = acesa ? VARIAVEL_DA_COR[cor] : '#8d97a8'
          const meiaL = LARGURA_NO / 2
          const meiaA = ALTURA_NO / 2
          return (
            <g
              key={etapa.id}
              onMouseEnter={() => setEmFoco(etapa.id)}
              onMouseLeave={() => setEmFoco(null)}
              className="cursor-default"
            >
              <title>{`${etapa.id}: ${etapa.nome}`}</title>
              {etapa.id === ultima && (
                <motion.rect
                  x={x - meiaL - 3}
                  y={y - meiaA - 3}
                  width={LARGURA_NO + 6}
                  height={ALTURA_NO + 6}
                  rx={9}
                  fill="none"
                  stroke={traco}
                  strokeWidth={2}
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: [0.9, 0.15, 0.9] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                />
              )}
              {etapa.decisao ? (
                <polygon
                  points={`${x - meiaL},${y} ${x - meiaL + 9},${y - meiaA} ${x + meiaL - 9},${y - meiaA} ${x + meiaL},${y} ${x + meiaL - 9},${y + meiaA} ${x - meiaL + 9},${y + meiaA}`}
                  fill={fundo}
                  stroke={traco}
                  strokeWidth={acesa ? 1.8 : 1}
                />
              ) : (
                <rect
                  x={x - meiaL}
                  y={y - meiaA}
                  width={LARGURA_NO}
                  height={ALTURA_NO}
                  rx={6}
                  fill={fundo}
                  stroke={traco}
                  strokeWidth={acesa ? 1.8 : 1}
                  strokeDasharray={etapa.lateral ? '3 2' : undefined}
                />
              )}
              <text x={x} y={y - 3} textAnchor="middle" fontSize={10.5} fontWeight={800} fill={tinta}>
                {etapa.id}
              </text>
              <text x={x} y={y + 9} textAnchor="middle" fontSize={6.6} fontWeight={500} fill={tinta}>
                {abreviar(etapa.nome)}
              </text>
            </g>
          )
        })}
      </svg>
      {emFoco && (
        <p className="pointer-events-none sticky bottom-2 mx-2 rounded-lg bg-primary px-2.5 py-1.5 text-sm text-primary-foreground shadow-lg">
          <strong>{emFoco}</strong> {ETAPA_POR_ID[emFoco].nome}
        </p>
      )}
    </div>
  )
}

const LEGENDA: Cor[] = ['escuta', 'urgencia', 'cuidado', 'equipe', 'concluido', 'lateral']

export function MapaDoFluxo({ eventos }: { eventos: Evento[] }) {
  const [ampliado, setAmpliado] = useState(false)
  const percorridas = useMemo(() => {
    const mapa = new Map<string, Cor>()
    for (const evento of eventos) {
      if (!ETAPA_POR_ID[evento.etapa]) continue
      const cor = corDoEvento(evento)
      // A cor da decisão da equipe prevalece sobre a cor do grupo.
      if (!mapa.has(evento.etapa) || cor === 'equipe') mapa.set(evento.etapa, cor)
    }
    return mapa
  }, [eventos])
  const ultima = eventos.length ? eventos[eventos.length - 1].etapa : null

  return (
    <div className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{percorridas.size}</strong> de {ETAPAS.length} etapas percorridas
        </p>
        <Button variant="outline" size="sm" onClick={() => setAmpliado(true)}>
          <Maximize2 data-icon="inline-start" />
          Ampliar
        </Button>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {LEGENDA.map((cor) => (
          <li key={cor} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2.5 rounded-sm" style={{ background: VARIAVEL_DA_COR[cor] }} />
            {ROTULO_DA_COR[cor]}
          </li>
        ))}
      </ul>
      <Desenho percorridas={percorridas} ultima={ultima} />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Losangos são decisões, bordas tracejadas são saídas laterais e a etapa mais recente pisca.
      </p>

      <Dialog open={ampliado} onOpenChange={setAmpliado}>
        <DialogContent className="flex max-h-[92vh] w-[min(880px,96vw)] flex-col sm:max-w-none">
          <DialogHeader>
            <DialogTitle>Mapa completo do fluxo</DialogTitle>
            <DialogDescription>
              As 69 etapas do Pulse. O caminho percorrido aparece aceso na cor do grupo.
            </DialogDescription>
          </DialogHeader>
          <div className="rolagem min-h-0 flex-1">
            <Desenho percorridas={percorridas} ultima={ultima} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
