import { useState } from 'react'

import {
  AudioLines,
  BookOpenText,
  Check,
  ChevronDown,
  ClipboardCheck,
  Footprints,
  MessageSquareText,
  Pencil,
  ShieldCheck,
  ShieldX,
  X,
} from 'lucide-react'

import { api, type Canal, type Proposta } from '@/api'
import { Cartao, Etiqueta, Prazo, Rotulo, Selecao, Selo, TrechoLiteral, Vazio } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { Textarea } from '@/componentes/ui/textarea'
import { useEstado } from '@/estado'
import type { Cor } from '@/fluxo'
import { useAcao } from '@/lib/acao'
import { BARREIRA, diaEHora, ESTADO_PROPOSTA, FERRAMENTA, ORIGEM_FONTE, rotulo } from '@/lib/formato'
import { cn } from '@/lib/utils'

const COR_DO_ESTADO: Record<Proposta['estado'], Cor> = {
  pendente: 'equipe',
  aprovada: 'equipe',
  editada: 'equipe',
  recusada: 'lateral',
  expirada: 'lateral',
  cancelada: 'lateral',
  executada: 'concluido',
  falhou: 'urgencia',
}

const ESPECIALISTA: Record<Proposta['especialista'], string> = {
  intervencao: 'Agente de Intervenção',
  relatorio: 'Agente de Relatório',
  territorio: 'Agente de Território',
}

function IconeDoCanal({ canal }: { canal: Proposta['canal'] }) {
  if (canal === 'audio') return <AudioLines className="size-4" aria-hidden />
  if (canal === 'presencial') return <Footprints className="size-4" aria-hidden />
  return <MessageSquareText className="size-4" aria-hidden />
}

const NOME_DO_CANAL: Record<string, string> = { audio: 'Áudio', texto: 'Texto', presencial: 'Presencial' }

export function Fontes({ proposta }: { proposta: Pick<Proposta, 'fontes'> }) {
  const [aberta, setAberta] = useState<string | null>(null)
  if (proposta.fontes.length === 0) {
    return <p className="text-sm text-muted-foreground">Esta proposta não cita fontes.</p>
  }
  return (
    <ul className="flex flex-col gap-1">
      {proposta.fontes.map((fonte) => {
        const expandida = aberta === fonte.id
        return (
          <li key={fonte.id} className="rounded-lg border bg-background/60">
            <button
              type="button"
              onClick={() => setAberta(expandida ? null : fonte.id)}
              aria-expanded={expandida}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
            >
              <BookOpenText className="size-4 shrink-0 text-cuidado" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fonte.titulo}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{rotulo(ORIGEM_FONTE, fonte.origem)}</span>
              <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} aria-hidden />
            </button>
            {expandida && (
              <div className="border-t px-2.5 py-2">
                <p className="text-sm leading-relaxed">{fonte.trecho}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fonte.id}</span>
                  {fonte.origem !== 'historico' && <Selo>corpus sintético</Selo>}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Verificacao({ proposta }: { proposta: Proposta }) {
  const v = proposta.verificacao
  if (!v) {
    return <p className="text-sm text-muted-foreground">Esta proposta não passou pelo verificador independente.</p>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className={cn('flex items-center gap-1.5 text-sm font-semibold', v.aprovada ? 'text-concluido' : 'text-urgencia')}>
        {v.aprovada ? <ShieldCheck className="size-4" aria-hidden /> : <ShieldX className="size-4" aria-hidden />}
        {v.aprovada ? 'Aprovada pelo verificador' : 'Reprovada pelo verificador'}
      </p>
      {v.modelo && <p className="text-xs text-muted-foreground">Conferida por regras e pelo modelo {v.modelo}</p>}
      {(v.regras ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {v.regras.map((regra) => (
            <li key={regra.regra} className="inline-flex items-center gap-1" title={regra.detalhe}>
              {regra.passou ? <Check className="size-3 text-concluido" aria-hidden /> : <X className="size-3 text-urgencia" aria-hidden />}
              {regra.regra.replaceAll('_', ' ')}
            </li>
          ))}
        </ul>
      )}
      {(v.motivos ?? []).length > 0 && (
        <ul className="list-disc pl-5 text-sm text-foreground/85">
          {v.motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CartaoPendente({ proposta }: { proposta: Proposta }) {
  const { atuando, agora, propostas, casos, mostrarRastro } = useEstado()
  const { executar, ocupado, erro } = useAcao()
  const [modo, setModo] = useState<'ver' | 'editar' | 'recusar'>('ver')
  const eMensagem = proposta.ferramenta === 'enviar_mensagem'
  const descricaoInicial = typeof proposta.argumentos.descricao === 'string' ? proposta.argumentos.descricao : proposta.resumo
  const [texto, setTexto] = useState(proposta.texto_mensagem ?? '')
  const [canal, setCanal] = useState<Canal>(proposta.canal === 'audio' ? 'audio' : 'texto')
  const [descricao, setDescricao] = useState(descricaoInicial)
  const [justificativa, setJustificativa] = useState('')
  const profissional = atuando?.nome ?? ''

  const concluir = (acao: () => Promise<unknown>) =>
    executar(async () => {
      await acao()
      await Promise.all([propostas.recarregar(), casos.recarregar()])
    })

  return (
    <Cartao className="flex flex-col gap-3.5 border-equipe/50">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg leading-tight font-bold">{proposta.paciente_nome}</h3>
        <Etiqueta cor="cuidado">{rotulo(BARREIRA, proposta.barreira)}</Etiqueta>
        <Etiqueta cor={proposta.risco === 'alto' ? 'urgencia' : 'concluido'}>
          Risco {proposta.risco} pelo catálogo
        </Etiqueta>
        <span className="ml-auto text-sm text-muted-foreground">
          Validade: <Prazo prazo={proposta.validade} agora={agora} />
        </span>
      </header>

      {proposta.trecho_literal && (
        <div>
          <Rotulo className="mb-1">O que o paciente disse, sem alteração</Rotulo>
          <TrechoLiteral>{proposta.trecho_literal}</TrechoLiteral>
        </div>
      )}

      <div className="rounded-lg border-l-[3px] border-cuidado bg-cuidado-suave/50 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Rotulo>Proposta do {ESPECIALISTA[proposta.especialista]}</Rotulo>
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-cuidado">
            <IconeDoCanal canal={proposta.canal} />
            {rotulo(FERRAMENTA, proposta.ferramenta)}
            {proposta.canal && `, ${NOME_DO_CANAL[proposta.canal].toLowerCase()}`}
          </span>
        </div>
        <p className="mt-1 text-base font-semibold">{proposta.item_nome ?? proposta.resumo}</p>
        {proposta.item_nome && proposta.resumo !== proposta.item_nome && (
          <p className="text-sm text-foreground/85">{proposta.resumo}</p>
        )}
        {proposta.texto_mensagem && modo !== 'editar' && (
          <p className="mt-2 rounded-lg bg-card px-3 py-2 text-[0.95rem] leading-relaxed whitespace-pre-wrap">
            {proposta.texto_mensagem}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <Rotulo>Justificativa</Rotulo>
          <p className="text-sm leading-relaxed">{proposta.justificativa || 'Sem justificativa registrada.'}</p>
          <div className="mt-1.5">
            <Verificacao proposta={proposta} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Rotulo>Fontes</Rotulo>
          <Fontes proposta={proposta} />
        </div>
      </div>

      {modo === 'editar' && (
        <div className="flex flex-col gap-2 rounded-lg border border-equipe/50 bg-equipe-suave/40 p-3">
          {eMensagem ? (
            <>
              <label htmlFor={`texto-${proposta.id}`} className="text-sm font-semibold">
                Texto da mensagem
              </label>
              <Textarea id={`texto-${proposta.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} className="bg-card text-[0.95rem]" />
              <label className="flex items-center gap-2 text-sm font-semibold">
                Canal
                <Selecao value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
                  <option value="audio">Áudio</option>
                  <option value="texto">Texto</option>
                </Selecao>
              </label>
            </>
          ) : (
            <>
              <label htmlFor={`descricao-${proposta.id}`} className="text-sm font-semibold">
                Descrição da tarefa
              </label>
              <Textarea id={`descricao-${proposta.id}`} value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="bg-card text-[0.95rem]" />
            </>
          )}
          <div className="flex gap-2">
            <Button
              disabled={ocupado || !profissional || (eMensagem ? !texto.trim() : !descricao.trim())}
              onClick={() =>
                void concluir(() =>
                  api.editarProposta(
                    proposta.id,
                    profissional,
                    eMensagem ? { texto: texto.trim(), canal } : { descricao: descricao.trim() },
                  ),
                )
              }
            >
              <Check data-icon="inline-start" />
              Aprovar com a edição
            </Button>
            <Button variant="ghost" onClick={() => setModo('ver')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {modo === 'recusar' && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/60 p-3">
          <label htmlFor={`justificativa-${proposta.id}`} className="text-sm font-semibold">
            Por que a proposta foi recusada
          </label>
          <Textarea
            id={`justificativa-${proposta.id}`}
            value={justificativa}
            onChange={(e) => setJustificativa(e.target.value)}
            rows={2}
            placeholder="A justificativa fica no rastro e alimenta o ciclo de aprendizado"
            className="bg-card text-[0.95rem]"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={ocupado || !profissional || !justificativa.trim()}
              onClick={() => void concluir(() => api.recusarProposta(proposta.id, profissional, justificativa.trim()))}
            >
              Recusar proposta
            </Button>
            <Button variant="ghost" onClick={() => setModo('ver')}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {modo === 'ver' && (
        <footer className="flex flex-wrap items-center gap-2">
          <Button
            size="lg"
            className="bg-equipe px-4 text-white hover:bg-equipe/85"
            disabled={ocupado || !profissional}
            onClick={() => void concluir(() => api.aprovarProposta(proposta.id, profissional))}
          >
            <Check data-icon="inline-start" />
            Aprovar e executar
          </Button>
          <Button size="lg" variant="outline" disabled={ocupado} onClick={() => setModo('editar')}>
            <Pencil data-icon="inline-start" />
            Editar
          </Button>
          <Button size="lg" variant="outline" disabled={ocupado} onClick={() => setModo('recusar')}>
            <X data-icon="inline-start" />
            Recusar
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() =>
              mostrarRastro({
                tipo: 'caso',
                casoId: proposta.caso_id,
                titulo: `Caso de ${proposta.paciente_nome}`,
                reproduzir: false,
              })
            }
          >
            Ver rastro do caso
          </Button>
        </footer>
      )}
      <p className="text-xs text-muted-foreground">
        Nada é executado antes desta decisão. Decidindo como {profissional || 'ninguém selecionado'}.
      </p>
      {erro && <p className="text-sm font-medium text-urgencia">{erro}</p>}
    </Cartao>
  )
}

function LinhaDecidida({ proposta }: { proposta: Proposta }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 first:border-t-0">
      <Etiqueta cor={COR_DO_ESTADO[proposta.estado]}>{ESTADO_PROPOSTA[proposta.estado]}</Etiqueta>
      <span className="text-sm font-semibold">{proposta.paciente_nome}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{proposta.item_nome ?? proposta.resumo}</span>
      <span className="text-xs text-muted-foreground">
        {proposta.decidida_por ? `${proposta.decidida_por}, ` : ''}
        {diaEHora(proposta.decidida_em ?? proposta.criado_em)}
      </span>
      {proposta.motivo && <p className="w-full text-sm text-foreground/80">Motivo: {proposta.motivo}</p>}
    </li>
  )
}

export function AbaAprovacoes() {
  const { propostas } = useEstado()
  const todas = propostas.dados ?? []
  const pendentes = todas.filter((p) => p.estado === 'pendente')
  const decididas = todas
    .filter((p) => p.estado !== 'pendente')
    .sort((a, b) => (b.decidida_em ?? b.criado_em).localeCompare(a.decidida_em ?? a.criado_em))

  return (
    <div className="flex flex-col gap-4">
      {pendentes.length === 0 ? (
        <Vazio icone={ClipboardCheck} titulo="Nenhuma proposta aguardando decisão">
          Quando o Cuidado propõe uma ação, ela aparece aqui com o trecho literal do paciente e as fontes. Nada sai para
          o paciente nem para o ACS antes da aprovação da equipe.
        </Vazio>
      ) : (
        pendentes.map((proposta) => <CartaoPendente key={proposta.id} proposta={proposta} />)
      )}

      {decididas.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-bold text-muted-foreground">Já decididas</h3>
          <ul className="rounded-xl border bg-card">
            {decididas.map((proposta) => (
              <LinhaDecidida key={proposta.id} proposta={proposta} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
