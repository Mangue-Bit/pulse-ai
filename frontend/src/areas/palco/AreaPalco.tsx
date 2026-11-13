import { useMemo } from 'react'

import { motion } from 'framer-motion'
import { Check, ClipboardCheck, OctagonX, Route, Smartphone, Stethoscope } from 'lucide-react'

import { CartaoDeAlerta } from '@/areas/equipe/AbaAlertas'
import { CartaoPendente, LinhaDecidida } from '@/areas/equipe/AbaAprovacoes'
import { CartaoDeDuvida } from '@/areas/equipe/AbaDuvidas'
import { CENARIOS } from '@/areas/paciente/cenarios'
import { Compositor, Mensagens } from '@/areas/paciente/Conversa'
import { useConversa } from '@/areas/paciente/useConversa'
import { LinhaDoTempo } from '@/areas/rastro/LinhaDoTempo'
import { useRastro } from '@/areas/rastro/useRastro'
import { Rotulo, Selecao, Vazio } from '@/componentes/basicos'
import { useEstado, type OrigemDoRastro } from '@/estado'
import { cn } from '@/lib/utils'

import { montarTrilha, type Passo, type TomDaTrilha } from './trilha'

const AO_VIVO: OrigemDoRastro = { tipo: 'paciente' }

const TOM: Record<TomDaTrilha, { borda: string; fundo: string; cheio: string; texto: string }> = {
  cuidado: { borda: 'border-marca', fundo: 'bg-marca-suave', cheio: 'bg-marca', texto: 'text-marca' },
  urgencia: { borda: 'border-urgencia', fundo: 'bg-urgencia-suave', cheio: 'bg-urgencia', texto: 'text-urgencia' },
}

function PassoDaTrilha({ passo, numero, tom }: { passo: Passo; numero: number; tom: TomDaTrilha }) {
  const cores = TOM[tom]
  const { estado } = passo
  return (
    <li
      aria-current={estado === 'agora' ? 'step' : undefined}
      className={cn(
        'relative flex min-w-0 items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors',
        estado === 'feito' && 'bg-card',
        estado === 'agora' && cn('border-2', cores.borda, cores.fundo),
        estado === 'depois' && 'border-dashed bg-transparent',
        estado === 'parado' && 'bg-lateral-suave',
      )}
    >
      <span
        className={cn(
          'relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          estado === 'feito' && cn(cores.fundo, cores.texto),
          estado === 'agora' && cn(cores.cheio, 'text-white'),
          estado === 'depois' && 'bg-secondary text-muted-foreground',
          estado === 'parado' && 'bg-lateral text-white',
        )}
      >
        {estado === 'agora' && (
          <motion.span
            className={cn('absolute inset-0 rounded-full', cores.cheio)}
            animate={{ opacity: [0.45, 0], scale: [1, 2] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        {estado === 'feito' ? <Check className="size-3.5" aria-hidden /> : estado === 'parado' ? <OctagonX className="size-3.5" aria-hidden /> : <span className="relative">{numero}</span>}
      </span>
      <span className="min-w-0">
        <span className={cn('block font-display text-[0.95rem] leading-tight font-bold tracking-tight', estado === 'depois' && 'text-muted-foreground')}>
          {passo.titulo}
        </span>
        <span className={cn('mt-0.5 block text-sm leading-snug', estado === 'agora' ? 'text-foreground/80' : 'text-muted-foreground')}>
          {passo.detalhe}
        </span>
      </span>
    </li>
  )
}

function ColunaDaEquipe({ pacienteId }: { pacienteId: string }) {
  const { alertas, duvidas, propostas } = useEstado()
  const deste = <T extends { paciente_id: string }>(lista: T[] | null) => (lista ?? []).filter((item) => item.paciente_id === pacienteId)

  const alertasVivos = deste(alertas.dados).filter((a) => a.status !== 'encerrado')
  const duvidasAbertas = deste(duvidas.dados).filter((d) => d.status !== 'respondida')
  const respondida = deste(duvidas.dados)
    .filter((d) => d.status === 'respondida')
    .sort((a, b) => (b.respondida_em ?? '').localeCompare(a.respondida_em ?? ''))[0]
  const pendentes = deste(propostas.dados).filter((p) => p.estado === 'pendente')
  const decididas = deste(propostas.dados)
    .filter((p) => p.estado !== 'pendente')
    .sort((a, b) => (b.decidida_em ?? b.criado_em).localeCompare(a.decidida_em ?? a.criado_em))
    .slice(0, 3)

  const aguardando = alertasVivos.length + duvidasAbertas.length + pendentes.length
  const resolvido = decididas.length > 0 || respondida !== undefined

  return (
    <div className="rolagem flex min-h-0 flex-1 flex-col gap-3 bg-background p-3">
      {alertasVivos.map((alerta) => <CartaoDeAlerta key={alerta.id} alerta={alerta} />)}
      {duvidasAbertas.map((duvida) => <CartaoDeDuvida key={duvida.id} duvida={duvida} />)}
      {pendentes.map((proposta) => <CartaoPendente key={proposta.id} proposta={proposta} />)}
      {aguardando === 0 && (
        <Vazio icone={ClipboardCheck} titulo="Nada aguardando a equipe">
          O que este paciente relatar chega aqui para uma pessoa da equipe decidir.
        </Vazio>
      )}
      {resolvido && (
        <section className="mt-auto flex flex-col gap-2 pt-2">
          <Rotulo className="px-1">Já decidido para este paciente</Rotulo>
          {respondida && <CartaoDeDuvida duvida={respondida} />}
          {decididas.length > 0 && (
            <ul className="rounded-xl border bg-card">
              {decididas.map((proposta) => <LinhaDecidida key={proposta.id} proposta={proposta} />)}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export function AreaPalco() {
  const { paciente, pacientes, escolherPaciente, conectado, atuando, irPara } = useEstado()
  const conversa = useConversa()
  const rastro = useRastro(AO_VIVO, paciente?.id ?? null, conectado)
  const trilha = useMemo(() => montarTrilha(rastro.visiveis), [rastro.visiveis])

  return (
    <main className="tela-palco" aria-labelledby="titulo-palco">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h1 id="titulo-palco">Do relato à ação</h1>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Roteiros da demonstração">
          <span className="mr-1 text-sm font-semibold text-muted-foreground">Roteiros</span>
          {CENARIOS.map((cenario) => {
            const Icone = cenario.icone
            return (
              <button
                key={cenario.titulo}
                type="button"
                title={cenario.resultado}
                disabled={conversa.enviando || !paciente}
                onClick={() => conversa.preencher(cenario.texto)}
                className="inline-flex h-9 items-center gap-2 rounded-full border bg-card pr-3.5 pl-1.5 text-sm font-semibold hover:border-input hover:bg-muted disabled:opacity-60"
              >
                <span className={cn('flex size-6 items-center justify-center rounded-full', cenario.cor)}>
                  <Icone className="size-3.5" aria-hidden />
                </span>
                {cenario.titulo}
              </button>
            )
          })}
        </div>
      </header>

      <ol className="palco-trilha" aria-label="Etapas do atendimento">
        {trilha.passos.map((passo, indice) => (
          <PassoDaTrilha key={passo.titulo} passo={passo} numero={indice + 1} tom={trilha.tom} />
        ))}
      </ol>

      <div className="palco-colunas">
        <section className="palco-coluna" aria-label="Conversa do paciente">
          <header>
            <Smartphone aria-hidden />
            <h2>Paciente</h2>
            <Selecao
              aria-label="Paciente da demonstração"
              value={paciente?.id ?? ''}
              onChange={(e) => escolherPaciente(e.target.value)}
              className="ml-auto min-w-0 flex-1"
            >
              {(pacientes.dados ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Selecao>
          </header>
          <div className="rolagem min-h-0 flex-1 bg-background px-3 py-4">
            <Mensagens conversa={conversa} dica="Escolha um roteiro acima ou escreva como o paciente escreveria." />
          </div>
          <footer className="border-t px-3 pt-3 pb-3">
            <Compositor conversa={conversa} />
          </footer>
        </section>

        <section className="palco-coluna" aria-label="Decisões da equipe">
          <header>
            <Stethoscope aria-hidden />
            <h2>Equipe da unidade</h2>
            {atuando && <span className="ml-auto truncate text-sm text-muted-foreground">{atuando.nome}</span>}
          </header>
          {conectado && paciente ? (
            <ColunaDaEquipe pacienteId={paciente.id} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Sem conexão com o serviço.</p>
          )}
        </section>

        <section className="palco-coluna" aria-label="Rastro das decisões">
          <header>
            <Route aria-hidden />
            <h2>Como o Pulse decidiu</h2>
            <button type="button" className="painel-link ml-auto" onClick={() => irPara('rastro')}>
              Ver mapa
            </button>
          </header>
          <div className="rolagem min-h-0 flex-1">
            <LinhaDoTempo eventos={rastro.visiveis} vazio="Cada passo do Pulse aparece aqui enquanto acontece." />
          </div>
        </section>
      </div>
    </main>
  )
}
