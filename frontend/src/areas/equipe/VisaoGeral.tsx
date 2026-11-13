import { Search } from 'lucide-react'
import { useState } from 'react'

import { api } from '@/api'
import { useEstado, type AbaEquipe } from '@/estado'
import { nomeDaEtapa } from '@/fluxo'
import { useConsulta } from '@/lib/consulta'
import { diaEHora, hora, prazoRelativo } from '@/lib/formato'

type Tipo = 'alertas' | 'duvidas' | 'aprovacoes'
type Filtro = 'todas' | Tipo

const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'todas', nome: 'Todas' },
  { id: 'alertas', nome: 'Alertas' },
  { id: 'duvidas', nome: 'Dúvidas' },
  { id: 'aprovacoes', nome: 'Aprovações' },
]

const TIPOS: Record<Tipo, { nome: string; acao: string }> = {
  alertas: { nome: 'Alerta', acao: 'Ver alerta' },
  duvidas: { nome: 'Dúvida', acao: 'Ver dúvida' },
  aprovacoes: { nome: 'Aprovação', acao: 'Revisar' },
}

const ORDEM: Record<Tipo, number> = { alertas: 0, duvidas: 1, aprovacoes: 2 }

interface Pendencia {
  id: string
  tipo: Tipo
  paciente: string
  descricao: string
  prazo: string
  prioridade: boolean
}

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
}

export function VisaoGeral() {
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [busca, setBusca] = useState('')
  const { agora, conectado, alertas, duvidas, propostas, pacientes, abrirAba, irPara, escolherPaciente, mostrarRastro } = useEstado()
  const resumo = useConsulta(api.resumoGestor, 5000, '', conectado)
  const atividade = useConsulta(() => api.eventos({ limite: 4 }), 3000, '', conectado)

  const alertasAbertos = (alertas.dados ?? []).filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica')
  const duvidasAbertas = (duvidas.dados ?? []).filter((d) => d.status !== 'respondida')
  const pendentes = (propostas.dados ?? []).filter((p) => p.estado === 'pendente')
  const pendencias: Pendencia[] = [
    ...alertasAbertos.map((a): Pendencia => ({
      id: a.id, tipo: 'alertas', paciente: a.paciente_nome, descricao: a.trecho_literal, prazo: a.prazo, prioridade: true,
    })),
    ...duvidasAbertas.map((d): Pendencia => ({
      id: d.id, tipo: 'duvidas', paciente: d.paciente_nome, descricao: d.texto, prazo: d.prazo, prioridade: d.status === 'vencida',
    })),
    ...pendentes.map((p): Pendencia => ({
      id: p.id, tipo: 'aprovacoes', paciente: p.paciente_nome, descricao: p.item_nome ?? p.resumo, prazo: p.validade, prioridade: false,
    })),
  ].sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo] || a.prazo.localeCompare(b.prazo))

  const consultas = [alertas, duvidas, propostas]
  const filaIndisponivel = !conectado || consultas.some((c) => c.erro)
  const filaCarregando = !filaIndisponivel && consultas.some((c) => c.carregando)
  const filaPronta = !filaIndisponivel && !filaCarregando
  const termo = normalizar(busca.trim())
  const visiveis = pendencias.filter((item) =>
    (filtro === 'todas' || item.tipo === filtro) && normalizar(item.paciente).includes(termo),
  )

  const numeros: { aba: AbaEquipe; nome: string; valor: number | null; alerta?: boolean }[] = [
    { aba: 'alertas', nome: 'Alertas abertos', valor: alertas.dados ? alertasAbertos.length : null, alerta: alertasAbertos.length > 0 },
    { aba: 'aprovacoes', nome: 'Aguardando revisão', valor: propostas.dados ? pendentes.length : null },
    { aba: 'duvidas', nome: 'Dúvidas abertas', valor: duvidas.dados ? duvidasAbertas.length : null },
    { aba: 'casos', nome: 'Casos em aberto', valor: resumo.dados?.totais.casos_abertos ?? null },
  ]

  const abrirPendencia = (item: Pendencia) => abrirAba(item.tipo, item.tipo === 'aprovacoes' ? item.id : undefined)
  const nomePaciente = (id: string) => pacientes.dados?.find((p) => p.id === id)?.nome ?? 'Paciente'

  return (
    <main className="visao-geral" aria-labelledby="titulo-visao-geral">
      <header className="visao-cabecalho">
        <h1 id="titulo-visao-geral">Central de cuidado</h1>
        <button type="button" className="botao-secundario" onClick={() => irPara('paciente')}>Abrir conversa</button>
      </header>

      <div className="visao-indicadores" aria-label="Indicadores da equipe">
        {numeros.map(({ aba, nome, valor, alerta }) => (
          <button key={aba} type="button" data-alerta={alerta} onClick={() => abrirAba(aba)}>
            <strong>{valor ?? '—'}</strong> {nome}
          </button>
        ))}
      </div>

      <div className="visao-grade">
        <section className="painel fila" aria-labelledby="titulo-fila">
          <header className="painel-topo">
            <h2 id="titulo-fila">Pendências {filaPronta && <span>{pendencias.length}</span>}</h2>
          </header>
          <div className="fila-controles">
            <div className="fila-filtros" role="group" aria-label="Tipo de pendência">
              {FILTROS.map(({ id, nome }) => (
                <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{nome}</button>
              ))}
            </div>
            <label className="fila-busca">
              <Search aria-hidden />
              <input type="search" placeholder="Buscar paciente" aria-label="Buscar paciente na fila" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
          </div>
          {filaIndisponivel && <p className="painel-vazio" role="status">A fila está temporariamente indisponível.</p>}
          {filaCarregando && <p className="painel-vazio" role="status">Carregando pendências…</p>}
          {filaPronta && pendencias.length === 0 && <p className="painel-vazio">Nenhuma pendência no momento.</p>}
          {filaPronta && pendencias.length > 0 && visiveis.length === 0 && (
            <p className="painel-vazio" role="status">Nenhuma pendência encontrada.</p>
          )}
          {filaPronta && visiveis.length > 0 && (
            <>
              <div className="fila-colunas" aria-hidden="true"><span>Paciente</span><span>Tipo</span><span>Prazo</span></div>
              <ul className="lista">
                {visiveis.map((item) => {
                  const prazo = prazoRelativo(item.prazo, agora)
                  return (
                    <li key={item.id}>
                      <button type="button" className="fila-linha" onClick={() => abrirPendencia(item)}>
                        <span className="linha-texto"><strong>{item.paciente}</strong><span>{item.descricao}</span></span>
                        <span className="fila-tipo" data-alerta={item.tipo === 'alertas'}>{TIPOS[item.tipo].nome}</span>
                        <time data-urgente={prazo.vencido || item.prioridade} dateTime={item.prazo} title={diaEHora(item.prazo)}>{prazo.texto}</time>
                        <span className="fila-acao">{TIPOS[item.tipo].acao}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        <section className="painel" aria-labelledby="titulo-microareas">
          <header className="painel-topo">
            <h2 id="titulo-microareas">Casos por microárea</h2>
            <button type="button" className="painel-link" onClick={() => abrirAba('gestor')}>Visão do gestor</button>
          </header>
          {(!conectado || resumo.erro) && <p className="painel-vazio">Dados do território indisponíveis.</p>}
          {conectado && !resumo.erro && resumo.carregando && <p className="painel-vazio">Carregando microáreas…</p>}
          {resumo.dados && (
            <ul className="lista microareas">
              {resumo.dados.microareas.map((area) => (
                <li key={area.microarea_id}><span>{area.microarea_nome}</span><strong>{area.casos_abertos}</strong></li>
              ))}
            </ul>
          )}
        </section>

        <section className="painel" aria-labelledby="titulo-atividade">
          <header className="painel-topo">
            <h2 id="titulo-atividade">Atividade recente</h2>
            <button type="button" className="painel-link" onClick={() => irPara('rastro')}>Ver rastro</button>
          </header>
          {(!conectado || atividade.erro) && <p className="painel-vazio">Atividade temporariamente indisponível.</p>}
          {conectado && !atividade.erro && atividade.carregando && <p className="painel-vazio">Carregando atividade…</p>}
          {atividade.dados?.length === 0 && <p className="painel-vazio">Nenhuma atividade registrada.</p>}
          {!!atividade.dados?.length && (
            <ul className="lista">
              {[...atividade.dados].reverse().map((evento) => (
                <li key={evento.id}>
                  <button type="button" className="atividade-linha" onClick={() => {
                    if (evento.caso_id) {
                      mostrarRastro({ tipo: 'caso', casoId: evento.caso_id, titulo: `Caso de ${nomePaciente(evento.paciente_id)}`, reproduzir: false })
                    } else {
                      escolherPaciente(evento.paciente_id)
                      irPara('rastro')
                    }
                  }}>
                    <span className="linha-texto"><strong>{nomeDaEtapa(evento.etapa)}</strong><span>{nomePaciente(evento.paciente_id)}</span></span>
                    <time dateTime={evento.criado_em} title={diaEHora(evento.criado_em)}>{hora(evento.criado_em)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
