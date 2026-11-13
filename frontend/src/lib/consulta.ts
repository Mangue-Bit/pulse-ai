import { useCallback, useEffect, useRef, useState } from 'react'

export interface Consulta<T> {
  dados: T | null
  erro: boolean
  carregando: boolean
  recarregar: () => Promise<void>
}

/**
 * Consulta periódica: busca ao montar, repete a cada `intervaloMs` e refaz
 * quando `chave` muda. Com `ativa` falso, não busca.
 */
export function useConsulta<T>(
  buscar: () => Promise<T>,
  intervaloMs: number,
  chave: string = '',
  ativa: boolean = true,
): Consulta<T> {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const buscarAtual = useRef(buscar)
  buscarAtual.current = buscar
  const geracao = useRef(0)

  const recarregar = useCallback(async () => {
    const minha = geracao.current
    try {
      const resposta = await buscarAtual.current()
      if (minha !== geracao.current) return
      setDados(resposta)
      setErro(false)
    } catch {
      if (minha !== geracao.current) return
      setErro(true)
    } finally {
      if (minha === geracao.current) setCarregando(false)
    }
  }, [])

  useEffect(() => {
    geracao.current += 1
    setDados(null)
    setCarregando(true)
    if (!ativa) return
    void recarregar()
    const temporizador = window.setInterval(() => void recarregar(), intervaloMs)
    return () => window.clearInterval(temporizador)
  }, [chave, ativa, intervaloMs, recarregar])

  return { dados, erro, carregando, recarregar }
}
