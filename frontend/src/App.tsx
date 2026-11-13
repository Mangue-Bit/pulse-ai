import { AreaEquipe } from '@/areas/equipe/AreaEquipe'
import { VisaoGeral } from '@/areas/equipe/VisaoGeral'
import { AreaPaciente } from '@/areas/paciente/AreaPaciente'
import { AreaRastro } from '@/areas/rastro/AreaRastro'
import { BarraSuperior } from '@/componentes/BarraSuperior'
import { NavegacaoLateral } from '@/componentes/NavegacaoLateral'
import { ProvedorDeEstado, useEstado } from '@/estado'
import './central.css'

function Tela() {
  const { tela, aba } = useEstado()
  if (tela === 'equipe') return aba === 'visao-geral' ? <VisaoGeral /> : <AreaEquipe />
  if (tela === 'rastro') return <AreaRastro />
  return <AreaPaciente />
}

export default function App() {
  return (
    <ProvedorDeEstado>
      <div className="app">
        <NavegacaoLateral />
        <div className="app-corpo">
          <BarraSuperior />
          <div className="app-conteudo"><Tela /></div>
        </div>
      </div>
    </ProvedorDeEstado>
  )
}
