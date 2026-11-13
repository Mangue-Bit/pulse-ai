import { useEffect, useState } from 'react'

import { BellRing, ClipboardList, NotebookPen, UserRound } from 'lucide-react'

import { api, type Caso, type Profissional } from '@/api'
import { Cartao, Etiqueta, Selecao, Vazio } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { Textarea } from '@/componentes/ui/textarea'
import { useEstado } from '@/estado'
import { useAcao } from '@/lib/acao'
import { useConsulta } from '@/lib/consulta'
import { BARREIRA, diaEHora, rotulo } from '@/lib/formato'
import { cn } from '@/lib/utils'

/** ACS em uso nas abas ACS e Território: quem está atuando, se for ACS, ou o escolhido na aba. */
export function useAcsDaAba() {
  const { equipe, atuando } = useEstado()
  const todos = equipe.filter((p) => p.papel === 'acs')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  useEffect(() => {
    if (atuando?.papel === 'acs') setEscolhido(atuando.id)
  }, [atuando])
  const acs: Profissional | null = todos.find((p) => p.id === escolhido) ?? todos[0] ?? null
  return { acs, todos, escolher: setEscolhido }
}

export function SeletorDeAcs({
  acs,
  todos,
  escolher,
}: {
  acs: Profissional | null
  todos: Profissional[]
  escolher: (id: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <UserRound className="size-4 text-muted-foreground" aria-hidden />
      Agente comunitário
      <Selecao value={acs?.id ?? ''} onChange={(e) => escolher(e.target.value)}>
        {todos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </Selecao>
    </label>
  )
}

function FormularioDeResultado({ caso, acs, aoRegistrar }: { caso: Caso; acs: Profissional; aoRegistrar: () => Promise<unknown> }) {
  const { executar, ocupado, erro } = useAcao()
  const [resolvida, setResolvida] = useState<boolean | null>(null)
  const [observacao, setObservacao] = useState('')

  return (
    <div className="flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold">{caso.paciente_nome}</p>
        <Etiqueta cor="cuidado">{rotulo(BARREIRA, caso.barreira)}</Etiqueta>
        <span className="ml-auto text-xs text-muted-foreground">rodada {caso.rodada}</span>
      </div>
      <fieldset className="flex items-center gap-2">
        <legend className="mb-1 text-sm font-semibold">A barreira foi resolvida?</legend>
        {[
          { valor: true, nome: 'Sim, resolvida' },
          { valor: false, nome: 'Não resolvida' },
        ].map((opcao) => (
          <button
            key={opcao.nome}
            type="button"
            aria-pressed={resolvida === opcao.valor}
            onClick={() => setResolvida(opcao.valor)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold',
              resolvida === opcao.valor
                ? opcao.valor
                  ? 'border-concluido bg-concluido-suave text-concluido'
                  : 'border-urgencia bg-urgencia-suave text-urgencia'
                : 'bg-card hover:bg-muted',
            )}
          >
            {opcao.nome}
          </button>
        ))}
      </fieldset>
      <Textarea
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        rows={2}
        placeholder="Observação da visita"
        aria-label={`Observação sobre ${caso.paciente_nome}`}
        className="text-[0.95rem]"
      />
      <div>
        <Button
          disabled={ocupado || resolvida === null}
          onClick={() =>
            void executar(async () => {
              await api.registrarResultado(caso.caso_id, acs.id, resolvida === true, observacao.trim())
              setObservacao('')
              setResolvida(null)
              await aoRegistrar()
            })
          }
        >
          Registrar resultado
        </Button>
      </div>
      {erro && <p className="text-sm font-medium text-urgencia">{erro}</p>}
    </div>
  )
}

function RegistroDeVisita({ acs, aoRegistrar }: { acs: Profissional; aoRegistrar: () => Promise<unknown> }) {
  const { pacientes } = useEstado()
  const { executar, ocupado, erro } = useAcao()
  const daMicroarea = (pacientes.dados ?? []).filter((p) => p.microarea_id === acs.microarea_id)
  const [pacienteId, setPacienteId] = useState('')
  const [tipo, setTipo] = useState<'visita' | 'contato' | 'observacao'>('visita')
  const [texto, setTexto] = useState('')
  const [feito, setFeito] = useState(false)
  const alvo = daMicroarea.find((p) => p.id === pacienteId) ?? daMicroarea[0]

  return (
    <Cartao className="flex flex-col gap-2.5">
      <header className="flex items-center gap-2">
        <NotebookPen className="size-4 text-cuidado" aria-hidden />
        <h3 className="text-sm font-bold">Registrar visita, contato ou observação</h3>
      </header>
      <div className="flex flex-wrap gap-2">
        <Selecao aria-label="Paciente" value={alvo?.id ?? ''} onChange={(e) => setPacienteId(e.target.value)}>
          {daMicroarea.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </Selecao>
        <Selecao aria-label="Tipo de registro" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="visita">Visita</option>
          <option value="contato">Contato</option>
          <option value="observacao">Observação</option>
        </Selecao>
      </div>
      <Textarea
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value)
          setFeito(false)
        }}
        rows={3}
        placeholder="O que foi visto ou combinado na visita"
        aria-label="Texto do registro"
        className="text-[0.95rem]"
      />
      <div className="flex items-center gap-3">
        <Button
          disabled={ocupado || !texto.trim() || !alvo}
          onClick={() =>
            void executar(async () => {
              await api.registrarVisita(alvo!.id, acs.id, tipo, texto.trim())
              setTexto('')
              setFeito(true)
              await aoRegistrar()
            })
          }
        >
          Registrar
        </Button>
        {feito && <p className="text-sm font-medium text-concluido">Registro salvo.</p>}
      </div>
      {erro && <p className="text-sm font-medium text-urgencia">{erro}</p>}
    </Cartao>
  )
}

export function AbaAcs() {
  const { conectado, casos, propostas } = useEstado()
  const { acs, todos, escolher } = useAcsDaAba()
  const microarea = acs?.microarea_id ?? ''
  const territorio = useConsulta(() => api.territorio(microarea), 3000, microarea, conectado && microarea !== '')

  if (!acs) {
    return (
      <Vazio icone={UserRound} titulo="Nenhum agente comunitário disponível">
        A lista de agentes comunitários vem do serviço. Ela aparece quando a conexão voltar.
      </Vazio>
    )
  }

  const dados = territorio.dados
  const tarefas = (dados?.tarefas ?? []).filter((t) => t.acs_id === acs.id)
  const abertas = tarefas.filter((t) => t.status === 'aberta')
  const aguardando = dados?.casos_aguardando_resultado ?? []
  const avisos = dados?.avisos ?? []
  const recarregar = () => Promise.all([territorio.recarregar(), casos.recarregar(), propostas.recarregar()])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SeletorDeAcs acs={acs} todos={todos} escolher={escolher} />
        <p className="text-sm text-muted-foreground">{dados?.microarea_nome}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            <ClipboardList className="size-4 text-cuidado" aria-hidden />
            <h3 className="text-sm font-bold">Tarefas abertas</h3>
            <span className="ml-auto text-sm font-bold">{abertas.length}</span>
          </header>
          {abertas.length === 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma tarefa aberta.</p>
          )}
          {abertas.map((tarefa) => (
            <div key={tarefa.id} className="border-t pt-2 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">{tarefa.paciente_nome}</p>
                {tarefa.origem === 'urgencia' && <Etiqueta cor="urgencia">Visita prioritária</Etiqueta>}
                {tarefa.origem === 'manual' && <Etiqueta cor="lateral">Tarefa manual</Etiqueta>}
              </div>
              <p className="text-sm leading-snug">{tarefa.descricao}</p>
              {tarefa.prazo && <p className="text-xs text-muted-foreground">Prazo: {diaEHora(tarefa.prazo)}</p>}
            </div>
          ))}
        </Cartao>

        <Cartao className="flex flex-col gap-2">
          <header className="flex items-center gap-2">
            <BellRing className="size-4 text-escuta" aria-hidden />
            <h3 className="text-sm font-bold">Avisos</h3>
            <span className="ml-auto text-sm font-bold">{avisos.length}</span>
          </header>
          {avisos.length === 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">Nenhum aviso.</p>
          )}
          {avisos.map((aviso) => (
            <div key={`${aviso.paciente_id}-${aviso.criado_em}`} className="border-t pt-2 first:border-t-0 first:pt-0">
              <p className="text-sm font-bold">{aviso.paciente_nome}</p>
              <p className="text-sm leading-snug">{aviso.texto}</p>
              <p className="text-xs text-muted-foreground">{diaEHora(aviso.criado_em)}</p>
            </div>
          ))}
        </Cartao>
      </div>

      <Cartao className="flex flex-col gap-3">
        <header>
          <h3 className="text-sm font-bold">Registrar o resultado da visita</h3>
        </header>
        {aguardando.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma visita aguardando resultado.</p>
        ) : (
          aguardando.map((caso) => (
            <FormularioDeResultado key={caso.caso_id} caso={caso} acs={acs} aoRegistrar={recarregar} />
          ))
        )}
      </Cartao>

      <RegistroDeVisita acs={acs} aoRegistrar={recarregar} />
    </div>
  )
}
