import { useState } from 'react'

import { BarChart3, FileText, MapPinned } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { api } from '@/api'
import { Cartao, Selecao, Selo, Vazio } from '@/componentes/basicos'
import { useEstado } from '@/estado'
import { useConsulta } from '@/lib/consulta'
import { diaEHora, porcento } from '@/lib/formato'

// --- Território: visão do ACS, nominal ----------------------------------------

export function AbaTerritorio() {
  const { conectado, pacientes } = useEstado()
  const microareas = Array.from(
    new Map((pacientes.dados ?? []).map((p) => [p.microarea_id, p.microarea_nome])).entries(),
  )
  const [escolhida, setEscolhida] = useState('')
  const microarea = escolhida || microareas[0]?.[0] || ''
  const { dados } = useConsulta(() => api.territorio(microarea), 3000, microarea, conectado && microarea !== '')
  const porId = new Map((pacientes.dados ?? []).map((p) => [p.id, p]))

  if (!microarea) {
    return (
      <Vazio icone={MapPinned} titulo="Nenhuma microárea carregada">
        As microáreas vêm do serviço. A lista aparece quando a conexão voltar.
      </Vazio>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold">
          Microárea
          <Selecao value={microarea} onChange={(e) => setEscolhida(e.target.value)}>
            {microareas.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </Selecao>
        </label>
        {dados && (
          <p className="text-sm text-muted-foreground">
            ACS: {dados.acs.map((a) => a.nome).join(', ') || 'sem ACS'}
            {dados.lista_atualizada_em && `, lista atualizada em ${diaEHora(dados.lista_atualizada_em)}`}
          </p>
        )}
      </div>

      <p className="rounded-lg bg-cuidado-suave/60 px-3 py-2 text-sm leading-relaxed">
        Visão do ACS: lista nominal priorizada. As contagens e os prazos vêm das regras; o Agente de Território só ordena
        e explica o motivo, sem escore clínico.
      </p>

      {!dados || dados.lista.length === 0 ? (
        <Vazio icone={MapPinned} titulo="Lista ainda não gerada para esta microárea">
          A lista priorizada é montada pelo Agente de Território na checagem por tempo e só vale depois de aprovada pela
          equipe. Avance o relógio do sistema para disparar a checagem.
        </Vazio>
      ) : (
        <ol className="flex flex-col gap-2">
          {[...dados.lista]
            .sort((a, b) => a.posicao - b.posicao)
            .map((item) => {
              const paciente = porId.get(item.paciente_id)
              return (
                <li key={item.paciente_id}>
                  <Cartao className="flex items-start gap-3 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cuidado text-sm font-bold text-white">
                      {item.posicao}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold">{item.paciente_nome}</p>
                      <p className="text-sm leading-snug text-foreground/85">{item.motivo}</p>
                    </div>
                    {paciente && (
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <p className="text-sm">
                          Risco de abandono <strong>{porcento(paciente.risco_abandono)}</strong>
                        </p>
                        <Selo>nota sintética</Selo>
                      </div>
                    )}
                  </Cartao>
                </li>
              )
            })}
        </ol>
      )}
    </div>
  )
}

// --- Relatórios: fonte ao lado de cada frase ----------------------------------

export function AbaRelatorios() {
  const { conectado } = useEstado()
  const { dados } = useConsulta(() => api.relatorios(), 3000, '', conectado)
  const relatorios = dados ?? []

  if (relatorios.length === 0) {
    return (
      <Vazio icone={FileText} titulo="Nenhum relatório salvo">
        O Agente de Relatório redige a partir do registro do ACS e do histórico. Cada frase leva a fonte, e frase sem
        fonte é descartada pelo código. O relatório aparece aqui depois da aprovação da equipe.
      </Vazio>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {relatorios.map((relatorio) => (
        <Cartao key={relatorio.id} className="flex flex-col gap-2">
          <header className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-base font-bold">{relatorio.paciente_nome}</h3>
            <span className="ml-auto text-xs text-muted-foreground">{diaEHora(relatorio.criado_em)}</span>
          </header>
          <ul className="flex flex-col">
            {relatorio.frases.map((frase, indice) => (
              <li key={`${relatorio.id}-${indice}`} className="grid grid-cols-[1fr_11rem] gap-3 border-t py-2 first:border-t-0">
                <p className="text-[0.95rem] leading-relaxed">{frase.texto}</p>
                <p className="border-l-2 border-cuidado pl-2 text-xs leading-snug text-muted-foreground">
                  <span className="block font-semibold text-cuidado">{frase.fonte_titulo}</span>
                  {frase.fonte_id}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
      ))}
    </div>
  )
}

// --- Gestor: números agregados, sem nomes --------------------------------------

const COLUNAS = [
  { chave: 'pacientes', nome: 'Pacientes' },
  { chave: 'alto_risco', nome: 'Alto risco' },
  { chave: 'sem_aceite', nome: 'Sem aceite' },
  { chave: 'em_urgencia', nome: 'Em urgência' },
  { chave: 'aguardando_aprovacao', nome: 'Aguardando aprovação' },
  { chave: 'aguardando_resultado', nome: 'Aguardando resultado' },
  { chave: 'busca_ativa', nome: 'Busca ativa' },
  { chave: 'resolvidos', nome: 'Resolvidos' },
] as const

export function AbaGestor() {
  const { conectado } = useEstado()
  const { dados } = useConsulta(api.resumoGestor, 3000, '', conectado)

  if (!dados || dados.microareas.length === 0) {
    return (
      <Vazio icone={BarChart3} titulo="Sem números para mostrar">
        A visão do gestor é agregada na consulta, por microárea e sem nomes. Ela aparece quando o serviço responder.
      </Vazio>
    )
  }

  const grafico = dados.microareas.map((m) => ({
    nome: m.microarea_nome,
    'Aguardando aprovação': m.aguardando_aprovacao,
    'Aguardando resultado': m.aguardando_resultado,
    'Busca ativa': m.busca_ativa,
    Resolvidos: m.resolvidos,
  }))

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg bg-muted px-3 py-2 text-sm leading-relaxed">
        Visão agregada na consulta: números por microárea, sem nome de paciente. As contagens vêm das regras, nunca do
        modelo.
      </p>

      <div className="grid grid-cols-4 gap-2">
        {[
          { nome: 'Pacientes acompanhados', valor: dados.totais.pacientes },
          { nome: 'Casos abertos', valor: dados.totais.casos_abertos },
          { nome: 'Em busca ativa', valor: dados.totais.busca_ativa },
          { nome: 'Casos resolvidos', valor: dados.totais.resolvidos },
        ].map((total) => (
          <Cartao key={total.nome} className="p-3">
            <p className="text-xs font-semibold text-muted-foreground">{total.nome}</p>
            <p className="text-3xl leading-tight font-bold">{total.valor}</p>
          </Cartao>
        ))}
      </div>

      <Cartao>
        <h3 className="mb-2 text-sm font-bold">Casos por microárea</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="nome" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--border)', fontSize: 13 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Aguardando aprovação" stackId="casos" fill="var(--equipe)" />
              <Bar dataKey="Aguardando resultado" stackId="casos" fill="var(--cuidado)" />
              <Bar dataKey="Busca ativa" stackId="casos" fill="var(--urgencia)" />
              <Bar dataKey="Resolvidos" stackId="casos" fill="var(--concluido)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Cartao>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/70 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Microárea</th>
              {COLUNAS.map((coluna) => (
                <th key={coluna.chave} className="px-2 py-2 text-right font-semibold">
                  {coluna.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.microareas.map((m) => (
              <tr key={m.microarea_id} className="border-t">
                <td className="px-3 py-2 font-semibold">{m.microarea_nome}</td>
                {COLUNAS.map((coluna) => (
                  <td key={coluna.chave} className="px-2 py-2 text-right">
                    {m[coluna.chave]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t-2 bg-muted/40 font-bold">
              <td className="px-3 py-2">Total</td>
              {COLUNAS.map((coluna) => (
                <td key={coluna.chave} className="px-2 py-2 text-right">
                  {dados.totais[coluna.chave]}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Selo>nota sintética</Selo>
        A coluna de alto risco usa a nota de risco de abandono sintética, no lugar do modelo treinado.
      </div>
    </div>
  )
}
