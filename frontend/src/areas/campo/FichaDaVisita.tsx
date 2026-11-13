import { useState, type ComponentProps, type ReactNode } from 'react'

import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleCheck,
  CloudOff,
  Eye,
  EyeOff,
  HandHeart,
  House,
  Mic,
  MicOff,
  NotebookPen,
  Phone,
  Siren,
  type LucideIcon,
} from 'lucide-react'

import { api, type Profissional } from '@/api'
import { useVoz } from '@/areas/paciente/useVoz'
import { useEstado } from '@/estado'
import { useAcao } from '@/lib/acao'
import { BARREIRA, dia, rotulo, SITUACAO } from '@/lib/formato'
import { cn } from '@/lib/utils'

import type { Destino, FilaDeEnvio, TipoDeRegistro } from './useFilaDeEnvio'
import type { Visita } from './visitas'

const TIPOS: { id: TipoDeRegistro; nome: string; icone: LucideIcon }[] = [
  { id: 'visita', nome: 'Visita em casa', icone: House },
  { id: 'contato', nome: 'Contato', icone: Phone },
  { id: 'observacao', nome: 'Observação', icone: NotebookPen },
]

interface FrasePronta {
  nome: string
  texto: string
}

const FRASES: Record<TipoDeRegistro, FrasePronta[]> = {
  visita: [
    { nome: 'Estava em casa', texto: 'Paciente em casa, conversamos sobre os remédios.' },
    { nome: 'Não estava em casa', texto: 'Paciente não estava em casa.' },
    { nome: 'Tomando certo', texto: 'Está tomando os remédios como combinado.' },
    { nome: 'Ainda com dificuldade', texto: 'Continua com dificuldade para tomar os remédios.' },
    { nome: 'Familiar vai ajudar', texto: 'Um familiar vai ajudar com os horários.' },
  ],
  contato: [
    { nome: 'Falei por telefone', texto: 'Falei com o paciente por telefone.' },
    { nome: 'Falei com familiar', texto: 'Falei com um familiar.' },
    { nome: 'Não consegui contato', texto: 'Não consegui contato.' },
    { nome: 'Combinamos visita', texto: 'Combinamos uma visita.' },
  ],
  observacao: [
    { nome: 'Faltou remédio', texto: 'Faltou remédio na farmácia da unidade.' },
    { nome: 'Remarcar consulta', texto: 'Paciente pediu para remarcar a consulta.' },
    { nome: 'Mudou de endereço', texto: 'Paciente mudou de endereço.' },
  ],
}

const juntar = (atual: string, trecho: string) => [atual.trim(), trecho.trim()].filter(Boolean).join(' ')

function Bloco({ titulo, icone: Icone, tom, children }: { titulo: string; icone: LucideIcon; tom?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-lg leading-tight font-bold">
        <Icone className={cn('size-5 shrink-0', tom ?? 'text-muted-foreground')} aria-hidden />
        {titulo}
      </h3>
      {children}
    </section>
  )
}

function Confirmacao({ destino }: { destino: Destino }) {
  if (destino === 'enviado') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-concluido-suave px-3 py-2.5 font-semibold text-concluido">
        <CircleCheck className="size-5 shrink-0" aria-hidden />
        Salvo e enviado para a equipe.
      </p>
    )
  }
  return (
    <p role="status" className="flex items-center gap-2 rounded-xl bg-equipe-suave px-3 py-2.5 font-semibold text-equipe">
      <CloudOff className="size-5 shrink-0" aria-hidden />
      Guardado no aparelho. Vai para a equipe quando a conexão voltar.
    </p>
  )
}

function CampoDeTexto({
  valor,
  aoMudar,
  rotuloDoCampo,
  exemplo,
}: {
  valor: string
  aoMudar: (atualizar: (atual: string) => string) => void
  rotuloDoCampo: string
  exemplo: string
}) {
  const voz = useVoz((transcricao) => aoMudar((atual) => juntar(atual, transcricao)))
  return (
    <div className="flex items-start gap-2">
      <textarea
        value={voz.ouvindo ? juntar(valor, voz.parcial) : valor}
        onChange={(e) => aoMudar(() => e.target.value)}
        readOnly={voz.ouvindo}
        rows={3}
        aria-label={rotuloDoCampo}
        placeholder={voz.ouvindo ? 'Ouvindo…' : exemplo}
        className="min-h-24 flex-1 resize-none rounded-xl border border-input bg-card px-3.5 py-3 text-base leading-snug placeholder:text-muted-foreground"
      />
      {voz.temReconhecimento && (
        <button
          type="button"
          onClick={voz.ouvindo ? voz.pararDeOuvir : voz.ouvir}
          aria-label={voz.ouvindo ? 'Parar de ouvir' : 'Falar em vez de digitar'}
          className={cn(
            'flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border text-xs font-semibold',
            voz.ouvindo ? 'border-urgencia bg-urgencia-suave text-urgencia' : 'border-input bg-card text-foreground',
          )}
        >
          {voz.ouvindo ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
          {voz.ouvindo ? 'Parar' : 'Falar'}
        </button>
      )}
    </div>
  )
}

function BotaoPrincipal({ children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground active:translate-y-px disabled:bg-secondary disabled:text-muted-foreground"
      {...props}
    >
      {children}
    </button>
  )
}

function Autorizacao({ visita }: { visita: Visita }) {
  const { conectado, pacientes } = useEstado()
  const { executar, ocupado, erro } = useAcao()
  const [registrada, setRegistrada] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const { paciente } = visita
  if (!visita.pedirAutorizacao && !registrada) return null

  const registrar = () =>
    executar(async () => {
      await api.registrarAceite(paciente.id)
      setRegistrada(true)
      await pacientes.recarregar()
    })

  return (
    <Bloco titulo="Autorização de contato" icone={HandHeart} tom="text-equipe">
      {registrada ? (
        <p role="status" className="flex items-center gap-2 font-semibold text-concluido">
          <CircleCheck className="size-5 shrink-0" aria-hidden />
          Autorização registrada.
        </p>
      ) : confirmando ? (
        <>
          <p className="mb-3 leading-snug font-semibold">Confirma que {paciente.nome} autorizou receber mensagens do Pulse?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setConfirmando(false)}
              className="min-h-14 rounded-xl border-2 border-input bg-card px-3 text-lg font-bold"
            >
              Voltar
            </button>
            <BotaoPrincipal disabled={ocupado || !conectado} onClick={() => void registrar()}>
              <Check className="size-5" aria-hidden />
              Confirmar
            </BotaoPrincipal>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 leading-snug">
            {paciente.nome.split(' ')[0]} ainda não autorizou receber mensagens do Pulse. Explique como funciona e registre aqui se a
            resposta for sim.
          </p>
          <BotaoPrincipal disabled={!conectado} onClick={() => setConfirmando(true)}>
            <Check className="size-5" aria-hidden />
            O paciente autorizou
          </BotaoPrincipal>
          {!conectado && <p className="mt-2 text-sm font-medium text-equipe">A autorização só pode ser registrada com conexão.</p>}
        </>
      )}
      {erro && <p role="alert" className="mt-2 font-medium text-urgencia">{erro}</p>}
    </Bloco>
  )
}

interface PropsDoFormulario {
  visita: Visita
  acs: Profissional
  fila: FilaDeEnvio
  aoMudar: () => Promise<unknown>
}

const OPCOES_DE_RESULTADO = [
  { valor: true, nome: 'Sim, resolveu', ativo: 'border-concluido bg-concluido-suave text-concluido' },
  { valor: false, nome: 'Ainda não', ativo: 'border-urgencia bg-urgencia-suave text-urgencia' },
]

function Resultado({ visita, acs, fila, aoMudar }: PropsDoFormulario) {
  const { executar, ocupado, erro } = useAcao()
  const [resolvida, setResolvida] = useState<boolean | null>(null)
  const [observacao, setObservacao] = useState('')
  const [destino, setDestino] = useState<Destino | null>(null)
  const caso = visita.aguardando

  if (destino) {
    return (
      <Bloco titulo="Resultado da ajuda" icone={CircleCheck} tom="text-concluido">
        <Confirmacao destino={destino} />
      </Bloco>
    )
  }
  if (!caso) return null

  return (
    <Bloco titulo="A ajuda funcionou?" icone={CircleCheck} tom="text-cuidado">
      <p className="mb-3 leading-snug">
        A equipe tentou ajudar com: <strong>{rotulo(BARREIRA, caso.barreira).toLowerCase()}</strong>.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="A dificuldade foi resolvida?">
        {OPCOES_DE_RESULTADO.map((opcao) => (
          <button
            key={opcao.nome}
            type="button"
            aria-pressed={resolvida === opcao.valor}
            onClick={() => setResolvida(opcao.valor)}
            className={cn('min-h-14 rounded-xl border-2 px-3 text-lg font-bold', resolvida === opcao.valor ? opcao.ativo : 'border-input bg-card')}
          >
            {opcao.nome}
          </button>
        ))}
      </div>
      <CampoDeTexto valor={observacao} aoMudar={setObservacao} rotuloDoCampo="O que você viu na visita" exemplo="Se quiser, conte o que viu (opcional)" />
      <div className="mt-3">
        <BotaoPrincipal
          disabled={ocupado || resolvida === null}
          onClick={() =>
            void executar(async () => {
              const para = await fila.enviar(
                { tipo: 'resultado', caso_id: caso.caso_id, acs_id: acs.id, resolvida: resolvida === true, observacao: observacao.trim() },
                `Resultado de ${visita.paciente.nome}`,
              )
              setDestino(para)
              if (para === 'enviado') await aoMudar()
            })
          }
        >
          Salvar resultado
        </BotaoPrincipal>
      </div>
      {erro && <p role="alert" className="mt-2 font-medium text-urgencia">{erro}</p>}
    </Bloco>
  )
}

function Registro({ visita, acs, fila, aoMudar }: PropsDoFormulario) {
  const { executar, ocupado, erro } = useAcao()
  const [tipo, setTipo] = useState<TipoDeRegistro>('visita')
  const [texto, setTexto] = useState('')
  const [destino, setDestino] = useState<Destino | null>(null)

  const escrever = (atualizar: (atual: string) => string) => {
    setTexto(atualizar)
    setDestino(null)
  }

  return (
    <Bloco titulo="Registrar o que aconteceu" icone={NotebookPen}>
      <div className="mb-3 grid grid-cols-3 gap-2" role="group" aria-label="Tipo de registro">
        {TIPOS.map(({ id, nome, icone: Icone }) => (
          <button
            key={id}
            type="button"
            aria-pressed={tipo === id}
            onClick={() => setTipo(id)}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-2 text-sm leading-tight font-bold',
              tipo === id ? 'border-marca bg-marca-suave text-marca' : 'border-input bg-card',
            )}
          >
            <Icone className="size-5" aria-hidden />
            {nome}
          </button>
        ))}
      </div>
      <p className="mb-1.5 text-sm font-semibold text-muted-foreground">Toque em uma frase pronta ou escreva</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {FRASES[tipo].map(({ nome, texto: frase }) => (
          <button
            key={nome}
            type="button"
            onClick={() => escrever((atual) => (atual.includes(frase) ? atual : juntar(atual, frase)))}
            className="min-h-12 rounded-xl border border-input bg-background px-3.5 leading-tight font-semibold active:bg-muted"
          >
            {nome}
          </button>
        ))}
      </div>
      <CampoDeTexto valor={texto} aoMudar={escrever} rotuloDoCampo="O que aconteceu" exemplo="O que foi visto ou combinado" />
      <div className="sticky bottom-0 -mx-4 -mb-4 mt-1 flex flex-col gap-2 rounded-b-2xl bg-card px-4 pt-2 pb-4">
        {destino && <Confirmacao destino={destino} />}
        <BotaoPrincipal
          disabled={ocupado || !texto.trim()}
          onClick={() =>
            void executar(async () => {
              const para = await fila.enviar(
                { tipo: 'registro', paciente_id: visita.paciente.id, acs_id: acs.id, registro: tipo, texto: texto.trim() },
                `Registro de ${visita.paciente.nome}`,
              )
              setTexto('')
              setDestino(para)
              if (para === 'enviado') await aoMudar()
            })
          }
        >
          Salvar registro
        </BotaoPrincipal>
      </div>
      {erro && <p role="alert" className="mt-2 font-medium text-urgencia">{erro}</p>}
    </Bloco>
  )
}

export function FichaDaVisita({ visita, acs, fila, aoMudar, aoVoltar }: PropsDoFormulario & { aoVoltar: () => void }) {
  const [saudeVisivel, setSaudeVisivel] = useState(false)
  const { paciente } = visita
  const motivos = [
    visita.motivo,
    visita.aviso,
    ...visita.tarefas.map((tarefa) => (tarefa.prazo ? `${tarefa.descricao} Até ${dia(tarefa.prazo)}.` : tarefa.descricao)),
  ].filter((motivo): motivo is string => Boolean(motivo))

  return (
    <article className="flex flex-col gap-3 p-4" aria-label={`Visita a ${paciente.nome}`}>
      <button type="button" onClick={aoVoltar} className="campo-voltar min-h-12 items-center gap-2 self-start rounded-xl pr-4 font-bold text-marca">
        <ArrowLeft className="size-5" aria-hidden />
        Todas as visitas
      </button>

      <header>
        <h2 className="text-2xl leading-tight font-bold tracking-tight">{paciente.nome}</h2>
        <p className="mt-0.5 text-foreground/80">
          {paciente.idade} anos · {paciente.microarea_nome}
        </p>
        {paciente.situacao !== 'ativo' && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-urgencia-suave px-2.5 py-1 font-semibold text-urgencia">
            <Siren className="size-4" aria-hidden />
            {rotulo(SITUACAO, paciente.situacao)}
          </p>
        )}
      </header>

      <Bloco titulo="Por que visitar" icone={CalendarClock} tom={visita.prioritaria ? 'text-urgencia' : 'text-marca'}>
        {motivos.length === 0 ? (
          <p className="leading-snug">Sem pendência registrada. Visita de acompanhamento.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {motivos.map((motivo) => (
              <li key={motivo} className="flex gap-2 leading-snug">
                <span className="mt-2 size-2 shrink-0 rounded-full bg-marca" aria-hidden />
                {motivo}
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <section className="rounded-2xl border bg-card">
        <button
          type="button"
          aria-expanded={saudeVisivel}
          onClick={() => setSaudeVisivel((visivel) => !visivel)}
          className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-lg font-bold"
        >
          {saudeVisivel ? <EyeOff className="size-5 text-muted-foreground" aria-hidden /> : <Eye className="size-5 text-muted-foreground" aria-hidden />}
          Dados de saúde
          <span className="ml-auto text-base font-semibold text-marca">{saudeVisivel ? 'Esconder' : 'Mostrar'}</span>
        </button>
        {saudeVisivel && (
          <dl className="grid gap-3 border-t px-4 py-3">
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">Condições</dt>
              <dd className="leading-snug">{paciente.condicoes.join(', ') || 'Nenhuma registrada'}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-muted-foreground">Remédios em uso</dt>
              <dd className="leading-snug">{paciente.medicamentos.join(', ') || 'Nenhum registrado'}</dd>
            </div>
          </dl>
        )}
      </section>

      <Autorizacao visita={visita} />
      <Resultado visita={visita} acs={acs} fila={fila} aoMudar={aoMudar} />
      <Registro visita={visita} acs={acs} fila={fila} aoMudar={aoMudar} />
    </article>
  )
}
