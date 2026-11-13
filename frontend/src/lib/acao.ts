import { useCallback, useState } from 'react'

import { ErroDaApi } from '@/api'

/** Executa uma ação da equipe, guardando o estado de espera e a mensagem de erro. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const executar = useCallback(async (acao: () => Promise<unknown>): Promise<boolean> => {
    setOcupado(true)
    setErro(null)
    try {
      await acao()
      return true
    } catch (falha) {
      setErro(
        falha instanceof ErroDaApi
          ? `A ação não foi concluída: ${falha.message}`
          : 'A ação não foi concluída. Confira se o serviço está no ar.',
      )
      return false
    } finally {
      setOcupado(false)
    }
  }, [])

  return { executar, ocupado, erro }
}
