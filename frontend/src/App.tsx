import { AreaEquipe } from '@/areas/equipe/AreaEquipe'
import { AreaPaciente } from '@/areas/paciente/AreaPaciente'
import { AreaRastro } from '@/areas/rastro/AreaRastro'
import { BarraSuperior } from '@/componentes/BarraSuperior'
import { ProvedorDeEstado } from '@/estado'

export default function App() {
  return (
    <ProvedorDeEstado>
      <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden">
        <BarraSuperior />
        <div className="grid min-h-0 flex-1 grid-cols-[312px_minmax(0,1fr)_372px]">
          <AreaPaciente />
          <AreaEquipe />
          <AreaRastro />
        </div>
      </div>
    </ProvedorDeEstado>
  )
}
