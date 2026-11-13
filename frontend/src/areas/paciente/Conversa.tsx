import type { FormEvent, ReactNode } from 'react'

import { AnimatePresence, motion } from 'framer-motion'
import { AudioLines, BadgeCheck, Mic, MicOff, SendHorizontal, Siren, Square, Volume2 } from 'lucide-react'

import type { MensagemConversa } from '@/api'
import { Marca } from '@/componentes/Marca'
import { Button } from '@/componentes/ui/button'
import { hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

import type { ConversaDoPaciente } from './useConversa'

const iniciais = (nome: string) =>
  nome
    .split(' ')
    .filter((parte) => parte.length > 2)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()

export function Avatar({ nome, grande }: { nome: string; grande?: boolean }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-foreground/75',
        grande ? 'size-10 text-sm' : 'size-9 text-xs',
      )}
    >
      {iniciais(nome)}
    </span>
  )
}

function Balao({
  mensagem,
  falando,
  aoOuvir,
  aoCalar,
  temLeitura,
}: {
  mensagem: MensagemConversa
  falando: boolean
  aoOuvir: () => void
  aoCalar: () => void
  temLeitura: boolean
}) {
  const doPaciente = mensagem.autor === 'paciente'
  const emergencia = mensagem.etapa === 'U01' || mensagem.etapa === 'U04'
  const aprovada = mensagem.tipo === 'aprovada'
  const emAudio = mensagem.canal === 'audio'

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex flex-col gap-1', doPaciente ? 'items-end' : 'items-start')}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.98rem] leading-relaxed shadow-sm',
          doPaciente && 'rounded-br-md border border-marca/25 bg-marca-suave',
          !doPaciente && !emergencia && !aprovada && 'rounded-bl-md border bg-card',
          emergencia && 'rounded-bl-md border border-urgencia/40 bg-urgencia-suave text-foreground',
          aprovada && 'rounded-bl-md border border-concluido/40 bg-concluido-suave',
        )}
      >
        {emergencia && (
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-urgencia">
            <Siren className="size-4" aria-hidden />
            Emergência
          </p>
        )}
        {aprovada && (
          <p className="mb-1 flex items-center gap-1.5 text-sm font-bold text-concluido">
            <BadgeCheck className="size-4" aria-hidden />
            Enviada pela equipe de saúde
          </p>
        )}
        {emAudio && !doPaciente && (
          <div className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={falando ? aoCalar : aoOuvir}
              disabled={!temLeitura}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-concluido text-white disabled:opacity-40"
              aria-label={falando ? 'Parar a leitura' : 'Ouvir a mensagem'}
            >
              {falando ? <Square className="size-3.5" /> : <Volume2 className="size-4" />}
            </button>
            <AudioLines className={cn('size-5 text-concluido', falando && 'animate-pulse')} aria-hidden />
            <span className="text-sm font-semibold text-concluido">{falando ? 'Tocando' : 'Mensagem de voz'}</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{mensagem.texto}</p>
      </div>
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        {doPaciente && emAudio && (
          <span className="inline-flex items-center gap-0.5">
            <Mic className="size-3" aria-hidden />
            por voz
          </span>
        )}
        {!doPaciente && !emAudio && temLeitura && (
          <button type="button" onClick={falando ? aoCalar : aoOuvir} className="inline-flex items-center gap-0.5 hover:text-foreground">
            <Volume2 className="size-3" aria-hidden />
            {falando ? 'parar' : 'ouvir'}
          </button>
        )}
        <time>{hora(mensagem.criado_em)}</time>
      </p>
    </motion.li>
  )
}

export function Mensagens({ conversa, dica }: { conversa: ConversaDoPaciente; dica: string }) {
  const { paciente, conectado, mensagens, aceite, enviando, voz, fim } = conversa
  return (
    <div className="conversa-mensagens mx-auto flex w-full max-w-2xl flex-col">
      {!aceite && paciente && (
        <p className="mx-auto mb-4 rounded-2xl bg-equipe-suave px-3 py-1.5 text-center text-sm font-medium text-equipe">
          Este paciente ainda não autorizou o contato. O Pulse só orienta e avisa o agente comunitário.
        </p>
      )}
      {mensagens.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-marca-suave text-marca">
            <Marca className="h-5 w-auto" />
          </span>
          <p className="font-display text-lg font-bold tracking-tight">
            {conectado ? 'Nenhuma mensagem ainda' : 'Sem conexão com o serviço'}
          </p>
          <p className="max-w-sm text-[0.95rem] leading-relaxed text-muted-foreground">
            {conectado ? dica : 'A conversa volta quando o serviço responder.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {mensagens.map((mensagem) => (
              <Balao
                key={mensagem.id}
                mensagem={mensagem}
                temLeitura={voz.temLeitura}
                falando={voz.falandoId === mensagem.id}
                aoOuvir={() => voz.falar(mensagem.id, mensagem.texto)}
                aoCalar={voz.calar}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      {enviando && <p className="mt-3 self-start text-sm text-muted-foreground">Pulse está respondendo…</p>}
      <div ref={fim} />
    </div>
  )
}

export function Compositor({ conversa, acima }: { conversa: ConversaDoPaciente; acima?: ReactNode }) {
  const { paciente, texto, definirTexto, enviando, erro, aviso, enviar, voz, campo } = conversa

  const aoEnviar = (evento: FormEvent) => {
    evento.preventDefault()
    void enviar(texto, 'texto')
  }

  return (
    <div className="conversa-compositor mx-auto flex w-full max-w-2xl flex-col gap-2">
      {(aviso || erro) && (
        <p role="status" className={cn('text-sm font-medium', erro ? 'text-urgencia' : 'text-concluido')}>
          {erro ?? aviso}
        </p>
      )}
      {acima}
      <form onSubmit={aoEnviar} className="flex items-end gap-2">
        <textarea
          ref={campo}
          value={voz.ouvindo ? voz.parcial : texto}
          onChange={(e) => definirTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void enviar(texto, 'texto')
            }
          }}
          readOnly={voz.ouvindo}
          rows={1}
          placeholder={voz.ouvindo ? 'Ouvindo…' : 'Escreva como o paciente'}
          aria-label="Mensagem do paciente"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-input bg-background px-4 py-2.5 text-[0.95rem] leading-snug placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-muted-foreground"
        />
        {voz.temReconhecimento && (
          <Button
            type="button"
            variant={voz.ouvindo ? 'destructive' : 'outline'}
            className="size-11 rounded-full"
            onClick={voz.ouvindo ? voz.pararDeOuvir : voz.ouvir}
            disabled={!paciente || enviando}
            aria-label={voz.ouvindo ? 'Parar de ouvir' : 'Falar a mensagem'}
            title={voz.ouvindo ? 'Parar de ouvir' : 'Falar a mensagem'}
          >
            {voz.ouvindo ? <MicOff /> : <Mic />}
          </Button>
        )}
        <Button
          type="submit"
          className="size-11 rounded-full"
          disabled={!texto.trim() || enviando || !paciente}
          aria-label="Enviar mensagem"
        >
          <SendHorizontal />
        </Button>
      </form>
    </div>
  )
}
