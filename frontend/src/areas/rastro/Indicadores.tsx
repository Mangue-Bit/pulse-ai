import type { ReactNode } from 'react'

import { Activity, BadgeCheck } from 'lucide-react'

import { api } from '@/api'
import { Selo, Vazio } from '@/componentes/basicos'
import { useEstado } from '@/estado'
import { useConsulta } from '@/lib/consulta'
import { diaEHora, dolares, milissegundos, porcento } from '@/lib/formato'
import { cn } from '@/lib/utils'

function Medida({ titulo, valor, detalhe, tom }: { titulo: string; valor: string; detalhe: string; tom?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{titulo}</p>
      <p className={cn('mt-0.5 text-2xl leading-tight font-bold', tom)}>{valor}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{detalhe}</p>
    </div>
  )
}

function Bloco({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <header>
        <h3 className="text-sm font-bold">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </header>
      {children}
    </section>
  )
}

function Fracao({ rotulo, acertos, total }: { rotulo: string; acertos: number; total: number }) {
  const fracao = total > 0 ? acertos / total : 0
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{rotulo}</span>
        <span className="font-bold">
          {acertos} de {total}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-concluido" style={{ width: `${fracao * 100}%` }} />
      </div>
    </div>
  )
}

export function Indicadores() {
  const { conectado } = useEstado()
  const { dados: m } = useConsulta(api.metricas, 5000, '', conectado)

  if (!m) {
    return (
      <Vazio icone={Activity} titulo={conectado ? 'Calculando os indicadores' : 'Sem conexão com o serviço'}>
        Os indicadores são calculados sobre os eventos do rastro. Eles aparecem quando o serviço responde.
      </Vazio>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-3 py-3">
      <Bloco titulo="Sinal de degradação" descricao="Queda na aprovação sem edição ou alta na reprovação do verificador.">
        <div className="grid grid-cols-2 gap-2">
          <Medida
            titulo="Aprovação sem edição"
            valor={porcento(m.aprovacao.taxa_sem_edicao)}
            detalhe={`${m.aprovacao.aprovadas} aprovadas, ${m.aprovacao.editadas} editadas, ${m.aprovacao.recusadas} recusadas`}
            tom="text-equipe"
          />
          <Medida
            titulo="Reprovação do verificador"
            valor={porcento(m.verificador.taxa_reprovacao)}
            detalhe={`${m.verificador.reprovadas} de ${m.verificador.verificadas} propostas verificadas`}
            tom="text-cuidado"
          />
        </div>
      </Bloco>

      <Bloco titulo="Fadiga de alerta" descricao="Alertas que não eram urgência e dúvidas que venceram sem resposta.">
        <div className="grid grid-cols-3 gap-2">
          <Medida titulo="Alertas" valor={String(m.urgencia.alertas)} detalhe="abertos pela trilha" tom="text-urgencia" />
          <Medida titulo="Falsos positivos" valor={String(m.urgencia.falsos_positivos)} detalhe="marcados pela equipe" />
          <Medida titulo="Dúvidas vencidas" valor={String(m.urgencia.duvidas_vencidas)} detalhe="viraram alerta" />
        </div>
      </Bloco>

      <Bloco titulo="Operação" descricao="Latência e custo das chamadas ao modelo.">
        <div className="grid grid-cols-2 gap-2">
          <Medida
            titulo="Latência média"
            valor={milissegundos(m.operacao.latencia_media_ms)}
            detalhe={`${m.operacao.chamadas} chamadas ao modelo`}
          />
          <Medida
            titulo="Custo médio por caso"
            valor={dolares(m.operacao.custo_medio_por_caso)}
            detalhe={`${m.operacao.casos} casos, ${dolares(m.operacao.custo_total)} no total`}
          />
        </div>
        {m.por_prompt.length > 0 && (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-left text-[0.8rem]">
              <thead className="bg-muted/70 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">Prompt e modelo</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Chamadas</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Latência</th>
                </tr>
              </thead>
              <tbody>
                {m.por_prompt.map((linha) => (
                  <tr key={`${linha.versao_prompt}-${linha.modelo}`} className="border-t">
                    <td className="px-2 py-1.5">
                      <p className="font-semibold">{linha.versao_prompt}</p>
                      <p className="text-xs text-muted-foreground">{linha.modelo}</p>
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">
                      {linha.chamadas}
                      {linha.falhas > 0 && <span className="block text-xs text-urgencia">{linha.falhas} com falha</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right align-top">{milissegundos(linha.latencia_media_ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <Bloco titulo="Teste fixo" descricao="Mensagens sintéticas rotuladas, rodadas contra o fluxo da Escuta.">
        {m.teste_fixo ? (
          <div className="flex flex-col gap-2.5 rounded-lg border bg-card p-3">
            <Fracao
              rotulo="Urgências detectadas"
              acertos={m.teste_fixo.urgencias.detectadas}
              total={m.teste_fixo.urgencias.esperadas}
            />
            <Fracao rotulo="Barreira certa" acertos={m.teste_fixo.barreiras.acertos} total={m.teste_fixo.barreiras.total} />
            <Fracao
              rotulo="Dúvidas clínicas reconhecidas"
              acertos={m.teste_fixo.duvidas.acertos}
              total={m.teste_fixo.duvidas.total}
            />
            <Fracao
              rotulo="Tentativas de instrução contidas"
              acertos={m.teste_fixo.injecoes.contidas}
              total={m.teste_fixo.injecoes.total}
            />
            <p className="text-xs text-muted-foreground">
              {m.teste_fixo.total} mensagens, modelo {m.teste_fixo.modelo}, em {diaEHora(m.teste_fixo.executado_em)}
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed bg-card p-3 text-sm text-muted-foreground">
            O teste fixo ainda não foi executado. Rode <code className="font-semibold">python -m avaliacao.rodar</code> na
            pasta backend para ver o resultado aqui.
          </p>
        )}
      </Bloco>

      <section className="flex items-start gap-3 rounded-lg border bg-card p-3">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-concluido" aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">Modelo de risco de abandono</h3>
            {m.modelo_de_risco.simulado && <Selo />}
          </div>
          <p className="text-sm">
            Versão {m.modelo_de_risco.versao}, {m.modelo_de_risco.situacao}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            O protótipo usa uma nota sintética por paciente. Uma versão nova só é promovida depois de passar pelo teste
            fixo.
          </p>
        </div>
      </section>
    </div>
  )
}
