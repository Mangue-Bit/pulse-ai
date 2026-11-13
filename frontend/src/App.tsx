import { AreaCampo } from '@/areas/campo/AreaCampo'
import { AreaEquipe } from '@/areas/equipe/AreaEquipe'
import { VisaoGeral } from '@/areas/equipe/VisaoGeral'
import { AreaPaciente } from '@/areas/paciente/AreaPaciente'
import { AreaPalco } from '@/areas/palco/AreaPalco'
import { AreaRastro } from '@/areas/rastro/AreaRastro'
import { BarraSuperior } from '@/componentes/BarraSuperior'
import { NavegacaoLateral } from '@/componentes/NavegacaoLateral'
import { ProvedorDeEstado, useEstado } from '@/estado'
import './central.css'

function Tela() {
  const { tela, aba } = useEstado()
  if (tela === 'equipe') return aba === 'visao-geral' ? <VisaoGeral /> : <AreaEquipe />
  if (tela === 'rastro') return <AreaRastro />
  if (tela === 'palco') return <AreaPalco />
  if (tela === 'campo') return <AreaCampo />
  return <AreaPaciente />
}

function Casca() {
  const { tela, geracao } = useEstado()
  return (
    <div className="app" data-tela={tela}>
      <NavegacaoLateral />
      <div className="app-corpo">
        <BarraSuperior />
        <div className="app-conteudo"><Tela key={geracao} /></div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ProvedorDeEstado>
      <Casca />
    </ProvedorDeEstado>
  )
}
