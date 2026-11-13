import type { Caso, Paciente, Tarefa, Territorio } from '@/api'

export interface Visita {
  paciente: Paciente
  posicao: number | null
  motivo: string | null
  tarefas: Tarefa[]
  aviso: string | null
  aguardando: Caso | null
  prioritaria: boolean
  pedirAutorizacao: boolean
}

export interface Visitas {
  pendentes: Visita[]
  demais: Visita[]
}

const temPendencia = (visita: Visita) =>
  visita.prioritaria ||
  visita.pedirAutorizacao ||
  visita.posicao !== null ||
  visita.tarefas.length > 0 ||
  visita.aviso !== null ||
  visita.aguardando !== null

const primeiroPrazo = (visita: Visita) =>
  visita.tarefas.reduce<string | null>((menor, tarefa) => (tarefa.prazo && (!menor || tarefa.prazo < menor) ? tarefa.prazo : menor), null)

function ordemDeVisita(a: Visita, b: Visita): number {
  if (a.prioritaria !== b.prioritaria) return a.prioritaria ? -1 : 1
  if (a.posicao !== b.posicao) return (a.posicao ?? Infinity) - (b.posicao ?? Infinity)
  const prazoA = primeiroPrazo(a)
  const prazoB = primeiroPrazo(b)
  if (prazoA !== prazoB) return (prazoA ?? '9') < (prazoB ?? '9') ? -1 : 1
  return a.paciente.nome.localeCompare(b.paciente.nome, 'pt-BR')
}

export function montarVisitas(pacientes: Paciente[], territorio: Territorio | null, acsId: string, microareaId: string): Visitas {
  const visitas = pacientes
    .filter((paciente) => paciente.microarea_id === microareaId)
    .map((paciente): Visita => {
      const item = territorio?.lista.find((i) => i.paciente_id === paciente.id)
      const tarefas = (territorio?.tarefas ?? []).filter(
        (t) => t.paciente_id === paciente.id && t.acs_id === acsId && t.status === 'aberta',
      )
      return {
        paciente,
        posicao: item?.posicao ?? null,
        motivo: item?.motivo ?? null,
        tarefas,
        aviso: territorio?.avisos.find((a) => a.paciente_id === paciente.id)?.texto ?? null,
        aguardando: territorio?.casos_aguardando_resultado.find((c) => c.paciente_id === paciente.id) ?? null,
        prioritaria: paciente.situacao === 'em_urgencia' || tarefas.some((t) => t.origem === 'urgencia'),
        pedirAutorizacao: !paciente.aceite_valido && paciente.situacao !== 'aceite_revogado',
      }
    })
  return {
    pendentes: visitas.filter(temPendencia).sort(ordemDeVisita),
    demais: visitas
      .filter((visita) => !temPendencia(visita))
      .sort((a, b) => a.paciente.nome.localeCompare(b.paciente.nome, 'pt-BR')),
  }
}
