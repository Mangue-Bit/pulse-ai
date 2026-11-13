import { useState } from 'react'

import { ArrowLeft, FolderOpen, History, Play } from 'lucide-react'

import { api, type Caso } from '@/api'
import { Cartao, Etiqueta, Rotulo, TrechoLiteral, Vazio } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { useEstado } from '@/estado'
import type { Cor } from '@/fluxo'
import { useConsulta } from '@/lib/consulta'
import { BARREIRA, diaEHora, ESTADO_PROPOSTA, rotulo, SITUACAO, STATUS_CASO } from '@/lib/formato'

import { Fontes } from './AbaAprovacoes'

export const COR_DO_STATUS: Record<Caso['status'], Cor> = {
  aberto: 'cuidado',
  aguardando_aprovacao: 'equipe',
  aguardando_resultado: 'cuidado',
  resolvido: 'concluido',
  busca_ativa: 'urgencia',
  suspenso: 'lateral',
}

function Detalhe({ casoId, aoVoltar }: { casoId: string; aoVoltar: () => void }) {
  const { conectado, mostrarRastro } = useEstado()
  const { dados: caso } = useConsulta(() => api.caso(casoId), 3000, casoId, conectado)

  if (!caso) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando o caso.</p>
  }

  const verRastro = (reproduzir: boolean) =>
    mostrarRastro({ tipo: 'caso', casoId: caso.caso_id, titulo: `Caso de ${caso.paciente_nome}`, reproduzir })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={aoVoltar}>
          <ArrowLeft data-icon="inline-start" />
          Todos os casos
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => verRastro(false)}>
            <History data-icon="inline-start" />
            Ver como o Pulse decidiu
          </Button>
          <Button variant="outline" size="sm" onClick={() => verRastro(true)}>
            <Play data-icon="inline-start" />
            Reproduzir passo a passo
          </Button>
        </div>
      </div>

      <Cartao className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-bold">{caso.paciente_nome}</h3>
          <Etiqueta cor={COR_DO_STATUS[caso.status]}>{STATUS_CASO[caso.status]}</Etiqueta>
          <Etiqueta cor="cuidado">{rotulo(BARREIRA, caso.barreira)}</Etiqueta>
        </header>
        <dl className="grid grid-cols-4 gap-3 text-sm">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Rodada</dt>
            <dd className="font-semibold">{caso.rodada}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Situação do paciente</dt>
            <dd className="font-semibold">{rotulo(SITUACAO, caso.situacao_paciente)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Aberto em</dt>
            <dd className="font-semibold">{diaEHora(caso.aberto_em)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Atualizado em</dt>
            <dd className="font-semibold">{diaEHora(caso.atualizado_em)}</dd>
          </div>
        </dl>
        {caso.pendencias.length > 0 && (
          <div>
            <Rotulo>Pendências</Rotulo>
            <ul className="list-disc pl-5 text-sm">
              {caso.pendencias.map((pendencia) => (
                <li key={pendencia}>{pendencia}</li>
              ))}
            </ul>
          </div>
        )}
      </Cartao>

      <Cartao className="flex flex-col gap-2">
        <h4 className="text-sm font-bold">O que o paciente contou</h4>
        {caso.relatos.length === 0 && <p className="text-sm text-muted-foreground">Este caso começou sem mensagem do paciente.</p>}
        {caso.relatos.map((relato) => (
          <div key={relato.id} className="flex flex-col gap-1">
            <TrechoLiteral>{relato.trecho_literal}</TrechoLiteral>
            <p className="text-xs text-muted-foreground">
              {diaEHora(relato.criado_em)}, {rotulo(BARREIRA, relato.barreira).toLowerCase()}
              {relato.lembrete && `, pediu lembrete: ${relato.lembrete}`}
            </p>
          </div>
        ))}
      </Cartao>

      <Cartao className="flex flex-col gap-2">
        <h4 className="text-sm font-bold">Sugestões do Pulse</h4>
        {caso.propostas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sugestão neste caso.</p>}
        {caso.propostas.map((proposta) => (
          <div key={proposta.id} className="flex flex-col gap-1.5 border-t pt-2 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta cor={proposta.estado === 'executada' ? 'concluido' : proposta.estado === 'pendente' ? 'equipe' : 'lateral'}>
                {ESTADO_PROPOSTA[proposta.estado]}
              </Etiqueta>
              <span className="text-sm font-semibold">{proposta.item_nome ?? proposta.resumo}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {proposta.decidida_por ? `${proposta.decidida_por}, ` : ''}
                {diaEHora(proposta.decidida_em ?? proposta.criado_em)}
              </span>
            </div>
            {proposta.texto_mensagem && <p className="text-sm leading-relaxed text-foreground/85">{proposta.texto_mensagem}</p>}
            {proposta.motivo && <p className="text-sm text-foreground/85">Motivo: {proposta.motivo}</p>}
            <Fontes proposta={proposta} />
          </div>
        ))}
      </Cartao>

      <div className="grid grid-cols-2 gap-3">
        <Cartao className="flex flex-col gap-2">
          <h4 className="text-sm font-bold">Tarefas do agente comunitário</h4>
          {caso.tarefas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa criada.</p>}
          {caso.tarefas.map((tarefa) => (
            <div key={tarefa.id} className="text-sm">
              <p className="font-semibold">{tarefa.descricao}</p>
              <p className="text-xs text-muted-foreground">
                {tarefa.status === 'aberta' ? 'Aberta' : 'Concluída'}
                {tarefa.prazo && `, prazo ${diaEHora(tarefa.prazo)}`}
              </p>
            </div>
          ))}
        </Cartao>
        <Cartao className="flex flex-col gap-2">
          <h4 className="text-sm font-bold">Resultados registrados</h4>
          {caso.resultados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum resultado registrado ainda.</p>}
          {caso.resultados.map((resultado) => (
            <div key={resultado.id} className="text-sm">
              <p className="font-semibold">
                {resultado.barreira_resolvida ? 'Barreira resolvida' : 'Barreira não resolvida'}
              </p>
              {resultado.observacao && <p className="text-foreground/85">{resultado.observacao}</p>}
              <p className="text-xs text-muted-foreground">
                {resultado.registrado_por}, {diaEHora(resultado.criado_em)}
              </p>
            </div>
          ))}
        </Cartao>
      </div>
    </div>
  )
}

export function AbaCasos() {
  const { casos } = useEstado()
  const [aberto, setAberto] = useState<string | null>(null)
  const lista = [...(casos.dados ?? [])].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))

  if (aberto) return <Detalhe casoId={aberto} aoVoltar={() => setAberto(null)} />

  if (lista.length === 0) {
    return (
      <Vazio icone={FolderOpen} titulo="Nenhum caso em acompanhamento">
        Um caso começa quando um paciente conta uma dificuldade ou o agente comunitário registra uma visita.
      </Vazio>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/70 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-semibold">Paciente</th>
            <th className="px-3 py-2 font-semibold">Dificuldade</th>
            <th className="px-3 py-2 font-semibold">Status</th>
            <th className="px-3 py-2 text-center font-semibold">Rodada</th>
            <th className="px-3 py-2 font-semibold">Atualizado</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((caso) => (
            <tr
              key={caso.caso_id}
              onClick={() => setAberto(caso.caso_id)}
              onKeyDown={(e) => e.key === 'Enter' && setAberto(caso.caso_id)}
              tabIndex={0}
              className="cursor-pointer border-t hover:bg-muted/50"
            >
              <td className="px-3 py-2.5 font-semibold">
                {caso.paciente_nome}
                {caso.situacao_paciente !== 'ativo' && (
                  <span className="block text-xs font-normal text-urgencia">{rotulo(SITUACAO, caso.situacao_paciente)}</span>
                )}
              </td>
              <td className="px-3 py-2.5">{rotulo(BARREIRA, caso.barreira)}</td>
              <td className="px-3 py-2.5">
                <Etiqueta cor={COR_DO_STATUS[caso.status]}>{STATUS_CASO[caso.status]}</Etiqueta>
              </td>
              <td className="px-3 py-2.5 text-center">{caso.rodada}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{diaEHora(caso.atualizado_em)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
