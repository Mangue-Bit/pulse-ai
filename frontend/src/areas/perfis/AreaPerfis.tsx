import { ArrowRight, ChartColumn, Check, EyeOff, Smartphone, Stethoscope, Tablet, type LucideIcon } from 'lucide-react'

import { useEstado } from '@/estado'

interface Perfil {
  nome: string
  aparelho: string
  icone: LucideIcon
  resumo: string
  ve: string[]
  naoVe: string[]
  abrir: string
  ir: (estado: ReturnType<typeof useEstado>) => void
}

const PERFIS: Perfil[] = [
  {
    nome: 'Paciente',
    aparelho: 'Celular, no WhatsApp',
    icone: Smartphone,
    resumo: 'Conta o que está difícil no tratamento, por texto ou por voz, quando quiser.',
    ve: [
      'A própria conversa com o Pulse',
      'Respostas de acolhimento, sem orientação clínica',
      'Mensagens da equipe, só depois de aprovadas por uma pessoa',
      'Orientação de emergência na hora, se houver sinal de urgência',
    ],
    naoVe: ['Dados de outros pacientes', 'Dose ou troca de remédio escrita por IA'],
    abrir: 'Abrir a conversa',
    ir: (estado) => estado.irPara('paciente'),
  },
  {
    nome: 'Agente comunitário (ACS)',
    aparelho: 'Tablet, em campo',
    icone: Tablet,
    resumo: 'Sabe quem visitar primeiro e por quê, e registra a visita com poucos toques.',
    ve: [
      'Os pacientes da sua microárea, com o risco de cada um parar o tratamento',
      'A lista de visitas, com o motivo de cada uma',
      'Tarefas e avisos criados pela equipe e pelo Pulse',
      'Registro de visita, autorização e resultado, mesmo sem conexão',
    ],
    naoVe: ['Pacientes de outras microáreas', 'Dados de saúde na tela, até tocar em "Mostrar"'],
    abrir: 'Abrir o tablet da ACS',
    ir: (estado) => estado.irPara('campo'),
  },
  {
    nome: 'Equipe de enfermagem',
    aparelho: 'Computador, na unidade',
    icone: Stethoscope,
    resumo: 'Decide. Nada chega ao paciente sem a aprovação de uma pessoa da equipe.',
    ve: [
      'Alertas de urgência, com prazo para confirmar',
      'Dúvidas clínicas, que só um profissional responde',
      'Sugestões do Pulse para aprovar, editar ou recusar, com as fontes',
      'O rastro de cada decisão, passo a passo',
    ],
    naoVe: ['Resposta clínica pronta escrita por IA'],
    abrir: 'Abrir a central da equipe',
    ir: (estado) => estado.abrirAba('visao-geral'),
  },
  {
    nome: 'Gestor',
    aparelho: 'Computador, na secretaria',
    icone: ChartColumn,
    resumo: 'Acompanha o território por números, para decidir onde reforçar a equipe.',
    ve: [
      'Pacientes acompanhados e casos abertos por microárea',
      'Quantos estão em alto risco, sem autorização ou em busca ativa',
      'Casos resolvidos e em andamento',
    ],
    naoVe: ['Nomes de pacientes', 'Conversas e relatos individuais'],
    abrir: 'Abrir a visão do gestor',
    ir: (estado) => estado.abrirAba('gestor'),
  },
]

export function AreaPerfis() {
  const estado = useEstado()
  return (
    <main className="tela-perfis" aria-labelledby="titulo-perfis">
      <header>
        <h1 id="titulo-perfis">Quem usa o Pulse</h1>
        <p className="mt-1 text-muted-foreground">Cada pessoa tem a sua tela e só vê o que precisa para a sua parte do cuidado.</p>
      </header>
      <ul className="perfis-grade">
        {PERFIS.map((perfil) => {
          const Icone = perfil.icone
          return (
            <li key={perfil.nome} className="flex flex-col rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marca-suave text-marca">
                  <Icone className="size-5.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg leading-tight font-bold tracking-tight">{perfil.nome}</h2>
                  <p className="text-sm font-medium text-muted-foreground">{perfil.aparelho}</p>
                </div>
              </div>
              <p className="mt-3 leading-snug font-medium">{perfil.resumo}</p>

              <h3 className="mt-4 mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">O que vê</h3>
              <ul className="flex flex-col gap-1.5">
                {perfil.ve.map((item) => (
                  <li key={item} className="flex gap-2 text-[0.95rem] leading-snug">
                    <Check className="mt-0.5 size-4 shrink-0 text-concluido" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 mb-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">O que não vê</h3>
              <ul className="mb-5 flex flex-col gap-1.5">
                {perfil.naoVe.map((item) => (
                  <li key={item} className="flex gap-2 text-[0.95rem] leading-snug text-foreground/80">
                    <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => perfil.ir(estado)}
                className="mt-auto flex min-h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-bold text-marca hover:bg-marca-suave"
              >
                {perfil.abrir}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
