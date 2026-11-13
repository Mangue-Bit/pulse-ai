import { useState } from 'react'

import { BellOff, Check, ChevronRight, Siren } from 'lucide-react'

import { api, type Alerta } from '@/api'
import { Cartao, Etiqueta, Prazo, TrechoLiteral, Vazio } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { useEstado } from '@/estado'
import { useAcao } from '@/lib/acao'
import { diaEHora, hora, NIVEL } from '@/lib/formato'
import { cn } from '@/lib/utils'

const CADEIA = ['plantao', 'enfermeiro', 'gestor'] as const

const ORIGEM: Record<Alerta['origem'], string> = {
  escuta: 'Percebido na conversa',
  cuidado: 'Percebido na revisão do caso',
  duvida_vencida: 'Dúvida sem resposta no prazo',
}

const ORDEM: Record<Alerta['status'], number> = { pendencia_critica: 0, aberto: 1, confirmado: 2, encerrado: 3 }

function Cadeia({ alerta }: { alerta: Alerta }) {
  const atual = CADEIA.indexOf(alerta.nivel)
  return (
    <ol className="flex items-stretch gap-1">
      {CADEIA.map((nivel, indice) => {
        const avisado = alerta.niveis_avisados.find((n) => n.nivel === nivel)
        const eAtual = indice === atual && alerta.status === 'aberto'
        const confirmou = alerta.status !== 'aberto' && alerta.status !== 'pendencia_critica' && indice === atual
        return (
          <li key={nivel} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                'flex-1 rounded-lg border px-2.5 py-1.5',
                eAtual && 'border-urgencia bg-urgencia-suave',
                confirmou && 'border-concluido bg-concluido-suave',
                !eAtual && !confirmou && avisado && 'bg-muted',
                !avisado && 'border-dashed opacity-60',
              )}
            >
              <p className={cn('text-sm font-bold', eAtual && 'text-urgencia', confirmou && 'text-concluido')}>
                {NIVEL[nivel]}
              </p>
              <p className="text-xs text-muted-foreground">
                {confirmou
                  ? 'confirmou'
                  : eAtual
                    ? 'aguardando confirmação'
                    : avisado
                      ? `avisado às ${hora(avisado.avisado_em)}, sem resposta`
                      : 'ainda não avisado'}
              </p>
            </div>
            {indice < CADEIA.length - 1 && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}

export function CartaoDeAlerta({ alerta }: { alerta: Alerta }) {
  const { atuando, agora, alertas, pacientes } = useEstado()
  const { executar, ocupado, erro } = useAcao()
  const [falsoPositivo, setFalsoPositivo] = useState(false)
  const profissional = atuando?.nome ?? ''
  const critica = alerta.status === 'pendencia_critica'
  const aberto = alerta.status === 'aberto'

  const depois = () => Promise.all([alertas.recarregar(), pacientes.recarregar()])

  return (
    <Cartao className={cn('flex flex-col gap-3 p-5 shadow-sm', critica && 'border-2 border-urgencia', aberto && 'border-urgencia/60')}>
      <header className="flex flex-wrap items-center gap-2">
        <Siren className={cn('size-5', alerta.status === 'encerrado' ? 'text-muted-foreground' : 'text-urgencia')} aria-hidden />
        <h3 className="text-base font-bold">{alerta.paciente_nome}</h3>
        {critica && <Etiqueta cor="urgencia">Pendência crítica</Etiqueta>}
        {aberto && <Etiqueta cor="urgencia">Aguardando confirmação</Etiqueta>}
        {alerta.status === 'confirmado' && <Etiqueta cor="equipe">Profissional assumiu</Etiqueta>}
        {alerta.status === 'encerrado' && <Etiqueta cor="lateral">Encerrado</Etiqueta>}
        <span className="ml-auto text-xs text-muted-foreground">aberto em {diaEHora(alerta.criado_em)}</span>
      </header>

      <TrechoLiteral>{alerta.trecho_literal}</TrechoLiteral>

      <p className="text-sm text-muted-foreground">
        {ORIGEM[alerta.origem]}
        {alerta.regra !== 'modelo' && `: ${alerta.regra.replaceAll('_', ' ')}`}
      </p>

      <Cadeia alerta={alerta} />

      {critica && (
        <p className="rounded-lg bg-urgencia-suave px-3 py-2 text-sm font-medium text-urgencia">
          Ninguém confirmou a tempo. O paciente foi orientado de novo a ligar 192 e o agente comunitário tem visita
          prioritária marcada.
        </p>
      )}

      {(aberto || critica) && (
        <footer className="flex flex-wrap items-center gap-3">
          <Button
            disabled={ocupado || !profissional}
            onClick={() => void executar(() => api.confirmarAlerta(alerta.id, profissional).then(depois))}
          >
            <Check data-icon="inline-start" />
            Confirmar e assumir o caso
          </Button>
          {aberto && (
            <p className="text-sm text-muted-foreground">
              Prazo do {NIVEL[alerta.nivel].toLowerCase()}: <Prazo prazo={alerta.prazo} agora={agora} />
            </p>
          )}
        </footer>
      )}

      {alerta.status === 'confirmado' && (
        <footer className="flex flex-wrap items-center gap-3">
          <p className="text-sm">
            Assumido por <strong>{alerta.confirmado_por}</strong>
            {alerta.confirmado_em && ` às ${hora(alerta.confirmado_em)}`}
          </p>
          <label className="ml-auto flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={falsoPositivo}
              onChange={(e) => setFalsoPositivo(e.target.checked)}
              className="size-4 accent-[var(--equipe)]"
            />
            Não era urgência
          </label>
          <Button
            variant="outline"
            disabled={ocupado || !profissional}
            onClick={() => void executar(() => api.encerrarAlerta(alerta.id, profissional, falsoPositivo).then(depois))}
          >
            Encerrar atendimento
          </Button>
        </footer>
      )}

      {erro && <p className="text-sm font-medium text-urgencia">{erro}</p>}
    </Cartao>
  )
}

export function AbaAlertas() {
  const { alertas } = useEstado()
  const lista = [...(alertas.dados ?? [])].sort(
    (a, b) => ORDEM[a.status] - ORDEM[b.status] || b.criado_em.localeCompare(a.criado_em),
  )

  if (lista.length === 0) {
    return (
      <Vazio icone={BellOff} titulo="Nenhum alerta agora">
        Quando um paciente relatar um sinal de urgência, o alerta aparece aqui.
      </Vazio>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {lista.map((alerta) => (
        <CartaoDeAlerta key={alerta.id} alerta={alerta} />
      ))}
    </div>
  )
}
