import { useCallback, useEffect, useRef, useState } from 'react'

import { api, ErroDaApi } from '@/api'

export type TipoDeRegistro = 'visita' | 'contato' | 'observacao'

export type Envio =
  | { tipo: 'registro'; paciente_id: string; acs_id: string; registro: TipoDeRegistro; texto: string }
  | { tipo: 'resultado'; caso_id: string; acs_id: string; resolvida: boolean; observacao: string }

export interface Guardado {
  id: string
  rotulo: string
  criado_em: string
  envio: Envio
  falha: string | null
}

export type Destino = 'enviado' | 'guardado'

const CHAVE = 'pulse.campo.fila'
const ESPERA_PARA_NOVA_TENTATIVA = 5000
const REGISTROS: TipoDeRegistro[] = ['visita', 'contato', 'observacao']

const eTexto = (valor: unknown): valor is string => typeof valor === 'string'

function eEnvio(valor: unknown): valor is Envio {
  if (typeof valor !== 'object' || valor === null) return false
  const envio = valor as Record<string, unknown>
  if (!eTexto(envio.acs_id)) return false
  if (envio.tipo === 'registro') {
    return eTexto(envio.paciente_id) && eTexto(envio.texto) && REGISTROS.some((registro) => registro === envio.registro)
  }
  return envio.tipo === 'resultado' && eTexto(envio.caso_id) && eTexto(envio.observacao) && typeof envio.resolvida === 'boolean'
}

function eGuardado(valor: unknown): valor is Guardado {
  if (typeof valor !== 'object' || valor === null) return false
  const item = valor as Record<string, unknown>
  return eTexto(item.id) && eTexto(item.rotulo) && eTexto(item.criado_em) && eEnvio(item.envio) && (item.falha === null || eTexto(item.falha))
}

function lerFila(): Guardado[] {
  const bruto = window.localStorage.getItem(CHAVE)
  if (!bruto) return []
  try {
    const lido: unknown = JSON.parse(bruto)
    return Array.isArray(lido) ? lido.filter(eGuardado) : []
  } catch {
    return []
  }
}

const semServico = (falha: unknown) => !(falha instanceof ErroDaApi) || falha.status >= 500

function executar(envio: Envio): Promise<unknown> {
  return envio.tipo === 'registro'
    ? api.registrarVisita(envio.paciente_id, envio.acs_id, envio.registro, envio.texto)
    : api.registrarResultado(envio.caso_id, envio.acs_id, envio.resolvida, envio.observacao)
}

export function useFilaDeEnvio(conectado: boolean, aoSincronizar: () => Promise<unknown>) {
  const [fila, setFila] = useState<Guardado[]>(lerFila)
  const [tentativa, setTentativa] = useState(0)
  const enviando = useRef(false)
  const espera = useRef<number | null>(null)
  const sincronizar = useRef(aoSincronizar)
  useEffect(() => {
    sincronizar.current = aoSincronizar
  }, [aoSincronizar])

  useEffect(() => {
    window.localStorage.setItem(CHAVE, JSON.stringify(fila))
  }, [fila])

  useEffect(
    () => () => {
      if (espera.current !== null) window.clearTimeout(espera.current)
    },
    [],
  )

  const enviar = useCallback(async (envio: Envio, rotulo: string): Promise<Destino> => {
    try {
      await executar(envio)
      return 'enviado'
    } catch (falha) {
      if (!semServico(falha)) throw falha
      const guardado: Guardado = { id: crypto.randomUUID(), rotulo, criado_em: new Date().toISOString(), envio, falha: null }
      setFila((atual) => [...atual, guardado])
      return 'guardado'
    }
  }, [])

  const descartar = useCallback((id: string) => setFila((atual) => atual.filter((item) => item.id !== id)), [])

  const aguardando = fila.filter((item) => item.falha === null)
  const proximo = aguardando[0]

  useEffect(() => {
    if (!conectado || !proximo || enviando.current) return
    enviando.current = true
    executar(proximo.envio)
      .then(async () => {
        setFila((atual) => atual.filter((item) => item.id !== proximo.id))
        await sincronizar.current()
      })
      .catch((falha: unknown) => {
        if (semServico(falha)) {
          espera.current = window.setTimeout(() => setTentativa((atual) => atual + 1), ESPERA_PARA_NOVA_TENTATIVA)
          return
        }
        const motivo = falha instanceof Error ? falha.message : 'O serviço recusou o registro.'
        setFila((atual) => atual.map((item) => (item.id === proximo.id ? { ...item, falha: motivo } : item)))
      })
      .finally(() => {
        enviando.current = false
      })
  }, [conectado, proximo, tentativa])

  return { fila, aguardando: aguardando.length, recusados: fila.length - aguardando.length, enviar, descartar }
}

export type FilaDeEnvio = ReturnType<typeof useFilaDeEnvio>
