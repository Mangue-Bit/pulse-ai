import {
  ChartColumn,
  ClipboardCheck,
  FileText,
  FolderHeart,
  Footprints,
  LayoutDashboard,
  MapPinned,
  Menu,
  MessageCircleQuestion,
  MessagesSquare,
  Presentation,
  Route,
  Siren,
  Tablet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Selecao } from '@/componentes/basicos'
import { Marca } from '@/componentes/Marca'
import { useEstado, type AbaEquipe } from '@/estado'
import { PAPEL } from '@/lib/formato'

interface Secao {
  id: AbaEquipe
  nome: string
  icone: LucideIcon
}

const GRUPOS: { titulo: string; secoes: Secao[] }[] = [
  {
    titulo: 'Atendimento',
    secoes: [
      { id: 'visao-geral', nome: 'Visão geral', icone: LayoutDashboard },
      { id: 'alertas', nome: 'Alertas', icone: Siren },
      { id: 'duvidas', nome: 'Dúvidas', icone: MessageCircleQuestion },
      { id: 'aprovacoes', nome: 'Aprovações', icone: ClipboardCheck },
      { id: 'casos', nome: 'Casos', icone: FolderHeart },
    ],
  },
  {
    titulo: 'Território e gestão',
    secoes: [
      { id: 'acs', nome: 'Agente comunitário', icone: Footprints },
      { id: 'territorio', nome: 'Território', icone: MapPinned },
      { id: 'relatorios', nome: 'Relatórios', icone: FileText },
      { id: 'gestor', nome: 'Visão do gestor', icone: ChartColumn },
    ],
  },
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
          <Marca />
          Pulse
        </button>
        <button type="button" className="lateral-menu-movel" aria-label="Menu do Pulse"
          aria-controls="lateral-menu" aria-expanded={aberto} onClick={() => setAberto((atual) => !atual)}>
          <Menu aria-hidden />
        </button>
      </div>
      <div className="lateral-menu" id="lateral-menu">
        <button type="button" className="lateral-palco" aria-current={tela === 'palco' ? 'page' : undefined}
          onClick={() => navegar(() => irPara('palco'))}>
          <Presentation aria-hidden />
          Demonstração guiada
        </button>
        <nav aria-label="Telas do Pulse">
          {GRUPOS.map(({ titulo, secoes }) => (
            <div key={titulo}>
              <p>{titulo}</p>
              {secoes.map(({ id, nome, icone: Icone }) => {
                const contador = contadores[id]
                return (
                  <button key={id} type="button" aria-current={tela === 'equipe' && aba === id ? 'page' : undefined}
                    onClick={() => navegar(() => abrirAba(id))}>
                    <Icone aria-hidden />
                    {nome}
                    {!!contador && <small data-alerta={id === 'alertas'}>{contador}</small>}
                  </button>
                )
              })}
            </div>
          ))}
          <p>Em campo</p>
          <button type="button" aria-current={tela === 'campo' ? 'page' : undefined} onClick={() => navegar(() => irPara('campo'))}>
            <Tablet aria-hidden />
            Tablet da ACS
          </button>
          <p>Bastidores</p>
          <button type="button" aria-current={tela === 'paciente' ? 'page' : undefined} onClick={() => navegar(() => irPara('paciente'))}>
            <MessagesSquare aria-hidden />
            Conversa do paciente
          </button>
          <button type="button" aria-current={tela === 'rastro' ? 'page' : undefined} onClick={() => navegar(() => irPara('rastro'))}>
            <Route aria-hidden />
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
