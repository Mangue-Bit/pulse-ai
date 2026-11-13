import { useCallback, useEffect, useRef, useState } from 'react'

import { api, type Evento } from '@/api'
import type { OrigemDoRastro } from '@/estado'

const INTERVALO_AO_VIVO = 250
const INTERVALO_REPRODUCAO = 520
const CONSULTA = 1500

export interface Rastro {
  visiveis: Evento[]
  naFila: number
  total: number
  /** Verdadeiro enquanto uma reprodução (de caso ou de gravação) está em curso. */
  reproduzindo: boolean
  pausado: boolean
  velocidade: number
  semConexao: boolean
  alternarPausa: () => void
  definirVelocidade: (v: number) => void
  reproduzirDoInicio: () => void
}

function chaveDaOrigem(origem: OrigemDoRastro, pacienteId: string | null): string {
  if (origem.tipo === 'paciente') return `paciente:${pacienteId ?? ''}`
  if (origem.tipo === 'caso') return `caso:${origem.casoId}:${origem.reproduzir}`
  return `gravacao:${origem.titulo}`
}

/**
 * Mantém a linha do tempo: carrega os eventos da origem, consulta os novos e
 * os revela um a um, para as etapas acenderem mesmo quando chegam juntas.
 */
export function useRastro(origem: OrigemDoRastro, pacienteId: string | null, conectado: boolean): Rastro {
  const [visiveis, setVisiveis] = useState<Evento[]>([])
  const [naFila, setNaFila] = useState(0)
  const [reproduzindo, setReproduzindo] = useState(false)
  const [pausado, setPausado] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [semConexao, setSemConexao] = useState(false)

  const fila = useRef<Evento[]>([])
  const conhecidos = useRef(new Set<string>())
  const ultimoId = useRef<string | null>(null)
  const chave = chaveDaOrigem(origem, pacienteId)
  const origemAtual = useRef(origem)
  origemAtual.current = origem
  const visiveisAtuais = useRef(visiveis)
  visiveisAtuais.current = visiveis

  const enfileirar = useCallback((eventos: Evento[]) => {
    const novos = eventos.filter((e) => !conhecidos.current.has(e.id))
    for (const evento of novos) conhecidos.current.add(evento.id)
    if (novos.length) {
      ultimoId.current = novos[novos.length - 1].id
      fila.current.push(...novos)
      setNaFila(fila.current.length)
    }
  }, [])

  const mostrarJa = useCallback((eventos: Evento[]) => {
    for (const evento of eventos) conhecidos.current.add(evento.id)
    ultimoId.current = eventos.length ? eventos[eventos.length - 1].id : null
    setVisiveis(eventos)
  }, [])

  // Carga inicial e consulta periódica.
  useEffect(() => {
    let cancelado = false
    fila.current = []
    conhecidos.current = new Set()
    ultimoId.current = null
    setVisiveis([])
    setNaFila(0)
    setPausado(false)
    setSemConexao(false)

    const atual = origemAtual.current
    if (atual.tipo === 'gravacao') {
      setReproduzindo(true)
      enfileirar(atual.eventos)
      return
    }
    setReproduzindo(atual.tipo === 'caso' && atual.reproduzir)

    let primeira = true
    const consultar = async () => {
      try {
        let eventos: Evento[]
        if (atual.tipo === 'caso') {
          eventos = await api.eventosDoCaso(atual.casoId)
        } else {
          if (!pacienteId) return
          eventos = await api.eventos({
            paciente_id: pacienteId,
            depois_de: ultimoId.current ?? undefined,
            limite: 200,
          })
        }
        if (cancelado) return
        setSemConexao(false)
        if (primeira && !(atual.tipo === 'caso' && atual.reproduzir)) mostrarJa(eventos)
        else enfileirar(eventos)
        primeira = false
      } catch {
        if (!cancelado) setSemConexao(true)
      }
    }

    if (!conectado) {
      setSemConexao(true)
      return
    }
    void consultar()
    const temporizador = window.setInterval(() => void consultar(), CONSULTA)
    return () => {
      cancelado = true
      window.clearInterval(temporizador)
    }
  }, [chave, conectado, pacienteId, enfileirar, mostrarJa])

  // Revela um evento da fila por vez.
  useEffect(() => {
    if (pausado) return
    const base = reproduzindo ? INTERVALO_REPRODUCAO : INTERVALO_AO_VIVO
    const temporizador = window.setInterval(() => {
      const proximo = fila.current.shift()
      if (!proximo) return
      setNaFila(fila.current.length)
      setVisiveis((atuais) => [...atuais, proximo])
    }, base / velocidade)
    return () => window.clearInterval(temporizador)
  }, [pausado, reproduzindo, velocidade])

  const reproduzirDoInicio = useCallback(() => {
    fila.current = [...visiveisAtuais.current, ...fila.current]
    setNaFila(fila.current.length)
    setVisiveis([])
    setReproduzindo(true)
    setPausado(false)
  }, [])

  return {
    visiveis,
    naFila,
    total: visiveis.length + naFila,
    reproduzindo: reproduzindo && (naFila > 0 || pausado),
    pausado,
    velocidade,
    semConexao,
    alternarPausa: () => setPausado((p) => !p),
    definirVelocidade: setVelocidade,
    reproduzirDoInicio,
  }
}
