import { useState } from 'react'

import { MessageCircleQuestion, Send } from 'lucide-react'

import { api, type Duvida } from '@/api'
import { Cartao, Etiqueta, Prazo, Rotulo, TrechoLiteral, Vazio } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { Textarea } from '@/componentes/ui/textarea'
import { useEstado } from '@/estado'
import { useAcao } from '@/lib/acao'
import { diaEHora } from '@/lib/formato'
import { cn } from '@/lib/utils'

const ORDEM: Record<Duvida['status'], number> = { aberta: 0, vencida: 1, respondida: 2 }

function CartaoDeDuvida({ duvida }: { duvida: Duvida }) {
  const { atuando, agora, duvidas } = useEstado()
  const { executar, ocupado, erro } = useAcao()
  const [resposta, setResposta] = useState('')
  const profissional = atuando?.nome ?? ''
  const pendente = duvida.status !== 'respondida'

  return (
    <Cartao className={cn('flex flex-col gap-3 p-5 shadow-sm', duvida.status === 'vencida' && 'border-urgencia/70')}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">{duvida.paciente_nome}</h3>
        {duvida.status === 'aberta' && <Etiqueta cor="equipe">Aguardando o profissional</Etiqueta>}
        {duvida.status === 'vencida' && <Etiqueta cor="urgencia">Prazo vencido</Etiqueta>}
        {duvida.status === 'respondida' && <Etiqueta cor="concluido">Respondida</Etiqueta>}
        <span className="ml-auto text-sm text-muted-foreground">
          {duvida.status === 'aberta' ? (
            <>
              Prazo: <Prazo prazo={duvida.prazo} agora={agora} />
            </>
          ) : (
            `recebida em ${diaEHora(duvida.criado_em)}`
          )}
        </span>
      </header>

      <TrechoLiteral>{duvida.texto}</TrechoLiteral>

      {pendente ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`resposta-${duvida.id}`} className="text-sm font-semibold">
            Resposta do profissional
          </label>
          <Textarea
            id={`resposta-${duvida.id}`}
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            placeholder="Escreva a resposta que o paciente vai receber"
            className="text-[0.95rem]"
          />
          <div className="flex items-center gap-3">
            <Button
              disabled={ocupado || !resposta.trim() || !profissional}
              onClick={() =>
                void executar(async () => {
                  await api.responderDuvida(duvida.id, profissional, resposta.trim())
                  setResposta('')
                  await duvidas.recarregar()
                })
              }
            >
              <Send data-icon="inline-start" />
              Enviar resposta
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Rotulo>
            Resposta de {duvida.respondida_por}
            {duvida.respondida_em && `, em ${diaEHora(duvida.respondida_em)}`}
          </Rotulo>
          <p className="mt-0.5 text-[0.95rem] leading-relaxed">{duvida.resposta}</p>
        </div>
      )}
      {erro && <p className="text-sm font-medium text-urgencia">{erro}</p>}
    </Cartao>
  )
}

export function AbaDuvidas() {
  const { duvidas } = useEstado()
  const lista = [...(duvidas.dados ?? [])].sort(
    (a, b) => ORDEM[a.status] - ORDEM[b.status] || a.prazo.localeCompare(b.prazo),
  )

  return (
    <div className="flex flex-col gap-3">
      {lista.length === 0 ? (
        <Vazio icone={MessageCircleQuestion} titulo="Nenhuma dúvida esperando resposta">
          Perguntas sobre dose, horário ou efeito de remédio aparecem aqui.
        </Vazio>
      ) : (
        lista.map((duvida) => <CartaoDeDuvida key={duvida.id} duvida={duvida} />)
      )}
    </div>
  )
}
