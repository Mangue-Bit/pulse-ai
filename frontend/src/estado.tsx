import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  api,
  type Alerta,
  type Caso,
  type Duvida,
  type Evento,
  type Paciente,
  type Profissional,
  type Proposta,
  type Relogio,
  type Saude,
} from '@/api'
import { useConsulta, type Consulta } from '@/lib/consulta'

export type AbaEquipe =
  | 'alertas'
  | 'duvidas'
  | 'aprovacoes'
  | 'casos'
  | 'acs'
  | 'territorio'
  | 'relatorios'
  | 'gestor'

export type Tela = 'paciente' | 'equipe' | 'rastro'

const ABAS: AbaEquipe[] = ['alertas', 'duvidas', 'aprovacoes', 'casos', 'acs', 'territorio', 'relatorios', 'gestor']

/** Lê a tela e a aba da equipe do endereço (#/equipe/aprovacoes), para o link e o recarregamento manterem o lugar. */
function lerEndereco(): { tela: Tela; aba: AbaEquipe | null } {
  const [tela, aba] = window.location.hash.replace(/^#\/?/, '').split('/')
  const valida = tela === 'equipe' || tela === 'rastro' ? tela : 'paciente'
  return { tela: valida, aba: ABAS.includes(aba as AbaEquipe) ? (aba as AbaEquipe) : null }
}

function escreverEndereco(tela: Tela, aba: AbaEquipe) {
  const destino = tela === 'equipe' ? `#/equipe/${aba}` : `#/${tela}`
  if (window.location.hash !== destino) window.history.replaceState(null, '', destino)
}

/** De onde vêm os eventos mostrados no painel do rastro. */
export type OrigemDoRastro =
  | { tipo: 'paciente' }
  | { tipo: 'caso'; casoId: string; titulo: string; reproduzir: boolean }
  | { tipo: 'gravacao'; titulo: string; eventos: Evento[] }

interface Estado {
  saude: Consulta<Saude>
  conectado: boolean
  pacientes: Consulta<Paciente[]>
  paciente: Paciente | null
  escolherPaciente: (id: string) => void
  equipe: Profissional[]
  atuando: Profissional | null
  escolherAtuando: (id: string) => void
  relogio: Consulta<Relogio>
  agora: string
  alertas: Consulta<Alerta[]>
  duvidas: Consulta<Duvida[]>
  propostas: Consulta<Proposta[]>
  casos: Consulta<Caso[]>
  tela: Tela
  irPara: (tela: Tela) => void
  aba: AbaEquipe
  abrirAba: (aba: AbaEquipe) => void
  rastro: OrigemDoRastro
  mostrarRastro: (origem: OrigemDoRastro) => void
  recarregarTudo: () => void
}

const Contexto = createContext<Estado | null>(null)

export function ProvedorDeEstado({ children }: { children: ReactNode }) {
  const saude = useConsulta(api.saude, 5000)
  const conectado = saude.dados !== null && !saude.erro
  const pacientes = useConsulta(api.pacientes, 3000, '', conectado)
  const equipeConsulta = useConsulta(api.equipe, 30000, '', conectado)
  const relogio = useConsulta(api.relogio, 5000, '', conectado)
  const alertas = useConsulta(api.alertas, 3000, '', conectado)
  const duvidas = useConsulta(api.duvidas, 3000, '', conectado)
  const propostas = useConsulta(() => api.propostas(), 3000, '', conectado)
  const casos = useConsulta(api.casos, 3000, '', conectado)

  const [pacienteId, setPacienteId] = useState<string | null>(null)
  const [atuandoId, setAtuandoId] = useState<string | null>(null)
  const [tela, setTela] = useState<Tela>(() => lerEndereco().tela)
  const [aba, setAba] = useState<AbaEquipe>(() => lerEndereco().aba ?? 'aprovacoes')
  const [rastro, setRastro] = useState<OrigemDoRastro>({ tipo: 'paciente' })

  useEffect(() => escreverEndereco(tela, aba), [tela, aba])
  useEffect(() => {
    const aoMudar = () => {
      const lido = lerEndereco()
      setTela(lido.tela)
      if (lido.aba) setAba(lido.aba)
    }
    window.addEventListener('hashchange', aoMudar)
    return () => window.removeEventListener('hashchange', aoMudar)
  }, [])

  const abrirAba = useCallback((nova: AbaEquipe) => {
    setAba(nova)
    setTela('equipe')
  }, [])

  // Abrir o rastro de um caso leva à tela do rastro; voltar ao vivo não muda de tela.
  const mostrarRastro = useCallback((origem: OrigemDoRastro) => {
    setRastro(origem)
    if (origem.tipo !== 'paciente') setTela('rastro')
  }, [])

  const paciente = useMemo(() => {
    const lista = pacientes.dados ?? []
    return lista.find((p) => p.id === pacienteId) ?? lista[0] ?? null
  }, [pacientes.dados, pacienteId])

  const equipe = useMemo(() => equipeConsulta.dados ?? [], [equipeConsulta.dados])
  const atuando = useMemo(
    () => equipe.find((p) => p.id === atuandoId) ?? equipe.find((p) => p.papel === 'enfermeiro') ?? equipe[0] ?? null,
    [equipe, atuandoId],
  )

  // O relógio do sistema anda entre uma consulta e outra.
  const [agora, setAgora] = useState(() => new Date().toISOString())
  useEffect(() => {
    const base = relogio.dados ? new Date(relogio.dados.agora).getTime() : Date.now()
    const lidoEm = Date.now()
    const atualizar = () => setAgora(new Date(base + (Date.now() - lidoEm)).toISOString())
    atualizar()
    const temporizador = window.setInterval(atualizar, 1000)
    return () => window.clearInterval(temporizador)
  }, [relogio.dados])

  const escolherPaciente = useCallback((id: string) => {
    setPacienteId(id)
    setRastro({ tipo: 'paciente' })
  }, [])

  const recarregarTudo = useCallback(() => {
    for (const consulta of [pacientes, relogio, alertas, duvidas, propostas, casos]) void consulta.recarregar()
  }, [pacientes, relogio, alertas, duvidas, propostas, casos])

  const valor: Estado = {
    saude,
    conectado,
    pacientes,
    paciente,
    escolherPaciente,
    equipe,
    atuando,
    escolherAtuando: setAtuandoId,
    relogio,
    agora,
    alertas,
    duvidas,
    propostas,
    casos,
    tela,
    irPara: setTela,
    aba,
    abrirAba,
    rastro,
    mostrarRastro,
    recarregarTudo,
  }

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export function useEstado(): Estado {
  const estado = useContext(Contexto)
  if (!estado) throw new Error('useEstado precisa do ProvedorDeEstado')
  return estado
}
