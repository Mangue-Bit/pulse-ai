import { useCallback, useMemo, useState } from 'react'

import { ChevronRight, CloudCheck, CloudOff, Hand, ListChecks, LogOut, RefreshCw, ShieldAlert, TriangleAlert, UserRound } from 'lucide-react'

import { api, type Profissional } from '@/api'
import { useAcsDaAba } from '@/areas/equipe/AbaAcs'
import { Vazio } from '@/componentes/basicos'
import { Marca } from '@/componentes/Marca'
import { useEstado } from '@/estado'
import { useConsulta } from '@/lib/consulta'
import { dia, diaDaSemana, hora } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { FichaDaVisita } from './FichaDaVisita'
import { PainelDeRisco } from './PainelDeRisco'
import { useFilaDeEnvio, type FilaDeEnvio } from './useFilaDeEnvio'
import { useUltimo } from './useUltimo'
import { montarVisitas, type Visita } from './visitas'

const plural = (quantidade: number, um: string, varios: string) => `${quantidade} ${quantidade === 1 ? um : varios}`

function Sincronia({ conectado, fila }: { conectado: boolean; fila: FilaDeEnvio }) {
  const base = 'flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-bold'
  if (fila.recusados > 0) {
    return (
      <p role="status" className={cn(base, 'bg-urgencia-suave text-urgencia')}>
        <TriangleAlert className="size-4.5" aria-hidden />
        {plural(fila.recusados, 'não enviado', 'não enviados')}
      </p>
    )
  }
  if (!conectado) {
    return (
      <p role="status" className={cn(base, 'bg-equipe-suave text-equipe')}>
        <CloudOff className="size-4.5" aria-hidden />
        Sem conexão{fila.aguardando > 0 && ` · ${plural(fila.aguardando, 'guardado', 'guardados')}`}
      </p>
    )
  }
  if (fila.aguardando > 0) {
    return (
      <p role="status" className={cn(base, 'bg-secondary text-foreground')}>
        <RefreshCw className="size-4.5 animate-spin" aria-hidden />
        Enviando {fila.aguardando}
      </p>
    )
  }
  return (
    <p role="status" className={cn(base, 'bg-concluido-suave text-concluido')}>
      <CloudCheck className="size-4.5" aria-hidden />
      Tudo enviado
    </p>
  )
}

function resumoDaVisita(visita: Visita): string {
  if (visita.motivo) return visita.motivo
  if (visita.tarefas.length > 0) return visita.tarefas[0].descricao
  if (visita.aviso) return visita.aviso
  if (visita.aguardando) return 'Contar para a equipe se a ajuda funcionou.'
  if (visita.pedirAutorizacao) return 'Ainda não autorizou o contato pelo Pulse.'
  return `${visita.paciente.idade} anos`
}

function Marcas({ visita }: { visita: Visita }) {
  const prazo = visita.tarefas.find((tarefa) => tarefa.prazo)?.prazo
  const base = 'rounded-lg px-2 py-0.5 text-sm font-bold'
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
      {visita.prioritaria && <span className={cn(base, 'bg-urgencia text-white')}>Urgente</span>}
      {visita.aguardando && <span className={cn(base, 'bg-cuidado-suave text-cuidado')}>Contar resultado</span>}
      {visita.pedirAutorizacao && <span className={cn(base, 'bg-equipe-suave text-equipe')}>Pedir autorização</span>}
      {prazo && <span className={cn(base, 'bg-secondary text-foreground')}>Até {dia(prazo)}</span>}
    </span>
  )
}

function CartaoDeVisita({ visita, ordem, aberta, aoAbrir }: { visita: Visita; ordem: number | null; aberta: boolean; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-current={aberta ? 'true' : undefined}
      className={cn(
        'flex min-h-18 w-full items-center gap-3 rounded-2xl border-2 bg-card px-3.5 py-3 text-left active:bg-muted',
        aberta ? 'border-marca bg-marca-suave' : 'border-transparent shadow-[0_0_0_1px_var(--border)]',
      )}
    >
      {ordem !== null && (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold',
            visita.prioritaria ? 'bg-urgencia text-white' : 'bg-secondary text-foreground',
          )}
          aria-hidden
        >
          {ordem}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-lg leading-tight font-bold">{visita.paciente.nome}</span>
        <span className="mt-0.5 line-clamp-2 leading-snug text-foreground/80">{resumoDaVisita(visita)}</span>
        <Marcas visita={visita} />
      </span>
      <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  )
}

function Guardados({ fila }: { fila: FilaDeEnvio }) {
  if (fila.fila.length === 0) return null
  return (
    <section className="rounded-2xl border border-equipe/40 bg-equipe-suave/60 p-3.5" aria-label="Registros guardados no aparelho">
      <h3 className="mb-2 flex items-center gap-2 font-bold text-equipe">
        <CloudOff className="size-5" aria-hidden />
        Guardados no aparelho
      </h3>
      <ul className="flex flex-col gap-2">
        {fila.fila.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block leading-tight font-semibold">{item.rotulo}</span>
              <span className="block text-sm text-foreground/75">
                {item.falha ? `Não foi aceito: ${item.falha}` : `Feito às ${hora(item.criado_em)}. Envia sozinho quando a conexão voltar.`}
              </span>
            </span>
            {item.falha && (
              <button type="button" onClick={() => fila.descartar(item.id)} className="min-h-12 rounded-xl border border-input px-3.5 font-semibold">
                Apagar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Tablet({ acs, agentes, escolher }: { acs: Profissional; agentes: Profissional[]; escolher: (id: string) => void }) {
  const { conectado, pacientes, agora, irPara, casos, propostas } = useEstado()
  const microarea = acs.microarea_id ?? ''
  const consulta = useConsulta(() => api.territorio(microarea), 3000, microarea, conectado && microarea !== '')
  const territorio = useUltimo(consulta.dados, microarea, agora)
  const carteira = useUltimo(pacientes.dados, 'pacientes', agora)
  const [aberta, setAberta] = useState<string | null>(null)
  const [aba, setAba] = useState<'visitas' | 'risco'>('visitas')

  const recarregarTerritorio = consulta.recarregar
  const recarregarPacientes = pacientes.recarregar
  const recarregarCasos = casos.recarregar
  const recarregarPropostas = propostas.recarregar
  const recarregar = useCallback(
    () => Promise.all([recarregarTerritorio(), recarregarPacientes(), recarregarCasos(), recarregarPropostas()]),
    [recarregarTerritorio, recarregarPacientes, recarregarCasos, recarregarPropostas],
  )
  const fila = useFilaDeEnvio(conectado, recarregar)

  const { pendentes, demais } = useMemo(
    () => montarVisitas(carteira.valor ?? [], territorio.valor, acs.id, microarea),
    [carteira.valor, territorio.valor, acs.id, microarea],
  )
  const visita = [...pendentes, ...demais].find((item) => item.paciente.id === aberta) ?? null

  return (
    <div className="campo-ecra" data-aberta={visita !== null}>
      <header className="campo-barra">
        <span className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-marca">
          <Marca className="h-6 w-auto" />
          Pulse
        </span>
        <label className="ml-2 flex min-w-0 flex-1 items-center gap-2">
          <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Agente comunitária</span>
          <select
            value={acs.id}
            onChange={(e) => {
              setAberta(null)
              escolher(e.target.value)
            }}
            className="min-h-12 max-w-64 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-base font-semibold"
          >
            {agentes.map((agente) => (
              <option key={agente.id} value={agente.id}>
                {agente.nome}
              </option>
            ))}
          </select>
        </label>
        <Sincronia conectado={conectado} fila={fila} />
        <button type="button" onClick={() => irPara('equipe')} className="campo-sair min-h-12 items-center gap-2 rounded-xl border border-input px-3.5 font-semibold">
          <LogOut className="size-5" aria-hidden />
          Sair
        </button>
      </header>

      <div className="campo-paineis">
        <section className="campo-lista rolagem" aria-label="Visitas">
          <div className="flex flex-col gap-3 p-4">
            <div className="campo-abas" role="group" aria-label="O que mostrar">
              <button type="button" aria-pressed={aba === 'visitas'} onClick={() => setAba('visitas')}>
                <ListChecks className="size-5" aria-hidden />
                Visitas
              </button>
              <button type="button" aria-pressed={aba === 'risco'} onClick={() => setAba('risco')}>
                <ShieldAlert className="size-5" aria-hidden />
                Risco da área
              </button>
            </div>
            {aba === 'risco' ? (
              <PainelDeRisco visitas={[...pendentes, ...demais]} aberta={aberta} aoAbrir={setAberta} />
            ) : (
              <>
            <header>
              <h2 className="text-2xl leading-tight font-bold tracking-tight">
                Para visitar <span className="font-medium text-muted-foreground">{pendentes.length}</span>
              </h2>
              <p className="mt-0.5 text-foreground/80">
                {territorio.valor?.microarea_nome ?? 'Sua área'} · {diaDaSemana(agora)}
              </p>
            </header>

            {!conectado && (
              <p role="status" className="rounded-2xl bg-equipe-suave px-3.5 py-3 leading-snug font-medium text-equipe">
                Sem conexão. {territorio.em ? `Você está vendo a lista das ${hora(territorio.em)}.` : 'A lista aparece quando a conexão voltar.'}{' '}
                O que você registrar fica guardado no aparelho.
              </p>
            )}

            <Guardados fila={fila} />

            {pendentes.length === 0 && territorio.valor && (
              <p className="rounded-2xl border bg-card px-3.5 py-4 leading-snug">Nenhuma visita pendente na sua área.</p>
            )}
            <ol className="flex flex-col gap-2.5">
              {pendentes.map((item, indice) => (
                <li key={item.paciente.id}>
                  <CartaoDeVisita visita={item} ordem={indice + 1} aberta={item.paciente.id === aberta} aoAbrir={() => setAberta(item.paciente.id)} />
                </li>
              ))}
            </ol>

            {demais.length > 0 && (
              <section aria-label="Outros pacientes da área">
                <h3 className="mt-2 mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">
                  Outros pacientes da área · {demais.length}
                </h3>
                <ul className="flex flex-col gap-2.5">
                  {demais.map((item) => (
                    <li key={item.paciente.id}>
                      <CartaoDeVisita visita={item} ordem={null} aberta={item.paciente.id === aberta} aoAbrir={() => setAberta(item.paciente.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
              </>
            )}
          </div>
        </section>

        <section className="campo-ficha rolagem" aria-label="Visita aberta">
          {visita ? (
            <FichaDaVisita key={visita.paciente.id} visita={visita} acs={acs} fila={fila} aoMudar={recarregar} aoVoltar={() => setAberta(null)} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <Hand className="size-7" aria-hidden />
              </span>
              <p className="text-xl font-bold">Toque em um paciente</p>
              <p className="max-w-xs leading-snug text-foreground/80">A visita abre aqui, com o motivo e o que registrar.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export function AreaCampo() {
  const { agora, equipe } = useEstado()
  const { acs: acsAtual, escolher } = useAcsDaAba()
  const agentesAtuais = useMemo(() => {
    const lista = equipe.filter((profissional) => profissional.papel === 'acs')
    return lista.length > 0 ? lista : null
  }, [equipe])
  const acs = useUltimo(acsAtual, 'acs', agora).valor
  const agentes = useUltimo(agentesAtuais, 'agentes', agora).valor ?? []

  return (
    <main className="tela-campo" aria-labelledby="titulo-campo">
      <header className="campo-cabecalho">
        <h1 id="titulo-campo">Pulse em campo</h1>
        <p>O que a agente comunitária vê no tablet durante as visitas.</p>
      </header>
      <div className="campo-aparelho">
        {acs ? (
          <Tablet key={acs.id} acs={acs} agentes={agentes} escolher={escolher} />
        ) : (
          <div className="campo-ecra">
            <Vazio icone={UserRound} titulo="Sem conexão com o serviço">
              A lista de visitas aparece quando a conexão voltar.
            </Vazio>
          </div>
        )}
      </div>
    </main>
  )
}
