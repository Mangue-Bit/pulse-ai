import { Menu } from 'lucide-react'
import { useState } from 'react'

import { Selecao } from '@/componentes/basicos'
import { useEstado, type AbaEquipe } from '@/estado'
import { PAPEL } from '@/lib/formato'

const SECOES: { id: AbaEquipe; nome: string }[] = [
  { id: 'visao-geral', nome: 'Visão geral' },
  { id: 'alertas', nome: 'Alertas' },
  { id: 'duvidas', nome: 'Dúvidas' },
  { id: 'aprovacoes', nome: 'Aprovações' },
  { id: 'casos', nome: 'Casos' },
  { id: 'acs', nome: 'Agente comunitário' },
  { id: 'territorio', nome: 'Território' },
  { id: 'relatorios', nome: 'Relatórios' },
  { id: 'gestor', nome: 'Visão do gestor' },
]

export function NavegacaoLateral() {
  const {
    tela, aba, abrirAba, irPara, alertas, duvidas, propostas, equipe, atuando, escolherAtuando,
  } = useEstado()
  const [aberto, setAberto] = useState(false)
  const contadores: Partial<Record<AbaEquipe, number>> = {
    alertas: alertas.dados?.filter((a) => a.status === 'aberto' || a.status === 'pendencia_critica').length,
    duvidas: duvidas.dados?.filter((d) => d.status !== 'respondida').length,
    aprovacoes: propostas.dados?.filter((p) => p.estado === 'pendente').length,
  }

  const navegar = (acao: () => void) => {
    setAberto(false)
    acao()
  }

  return (
    <aside className="lateral" data-aberto={aberto}>
      <div className="lateral-marca">
        <button type="button" onClick={() => navegar(() => abrirAba('visao-geral'))} aria-label="Pulse, visão geral">
          <svg viewBox="0 0 34 24" aria-hidden>
            <path d="M1 13h7l3-9 5 17 4-12 2 4h11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Pulse
        </button>
        <button type="button" className="lateral-menu-movel" aria-label="Menu do Pulse"
          aria-controls="lateral-menu" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)}>
          <Menu aria-hidden />
        </button>
      </div>
      <div className="lateral-menu" id="lateral-menu">
        <nav aria-label="Telas do Pulse">
          <p>Equipe</p>
          {SECOES.map(({ id, nome }) => {
            const contador = contadores[id]
            return (
              <button key={id} type="button" aria-current={tela === 'equipe' && aba === id ? 'page' : undefined}
                onClick={() => navegar(() => abrirAba(id))}>
                {nome}
                {!!contador && <small data-alerta={id === 'alertas'}>{contador}</small>}
              </button>
            )
          })}
          <p>Demonstração</p>
          <button type="button" aria-current={tela === 'paciente' ? 'page' : undefined} onClick={() => navegar(() => irPara('paciente'))}>
            Conversa do paciente
          </button>
          <button type="button" aria-current={tela === 'rastro' ? 'page' : undefined} onClick={() => navegar(() => irPara('rastro'))}>
            Rastro das decisões
          </button>
        </nav>
        <label className="lateral-profissional">
          <span>Você está como</span>
          <Selecao title={atuando?.nome} value={atuando?.id ?? ''} disabled={!equipe.length} onChange={(e) => escolherAtuando(e.target.value)}>
            {!equipe.length && <option value="">Aguardando equipe</option>}
            {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome.replace(/\s+\([^)]*\)$/, '')} · {PAPEL[p.papel]}</option>)}
          </Selecao>
        </label>
      </div>
    </aside>
  )
}
