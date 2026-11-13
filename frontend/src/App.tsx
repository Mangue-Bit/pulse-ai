import { AreaEquipe } from '@/areas/equipe/AreaEquipe'
import { AreaPaciente } from '@/areas/paciente/AreaPaciente'
import { AreaRastro } from '@/areas/rastro/AreaRastro'
import { BarraSuperior } from '@/componentes/BarraSuperior'
import { ProvedorDeEstado, useEstado } from '@/estado'

function Tela() {
  const { tela } = useEstado()
  if (tela === 'equipe') return <AreaEquipe />
  if (tela === 'rastro') return <AreaRastro />
  return <AreaPaciente />
}

export default function App() {
  return (
    <ProvedorDeEstado>
      <div className="flex h-screen flex-col overflow-hidden">
        <BarraSuperior />
        <div className="min-h-0 flex-1">
          <Tela />
        </div>
      </div>
    </ProvedorDeEstado>
  )
}
