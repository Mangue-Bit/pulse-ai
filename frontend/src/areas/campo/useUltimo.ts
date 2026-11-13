import { useState } from 'react'

interface Guardado<T> {
  chave: string
  valor: T | null
  em: string | null
}

export function useUltimo<T>(valor: T | null, chave: string, agora: string): { valor: T | null; em: string | null } {
  const [guardado, setGuardado] = useState<Guardado<T>>({ chave, valor, em: valor === null ? null : agora })
  if (guardado.chave !== chave) {
    setGuardado({ chave, valor, em: valor === null ? null : agora })
    return { valor, em: valor === null ? null : agora }
  }
  if (valor !== null && valor !== guardado.valor) setGuardado({ chave, valor, em: agora })
  return valor === null ? { valor: guardado.valor, em: guardado.em } : { valor, em: agora }
}
