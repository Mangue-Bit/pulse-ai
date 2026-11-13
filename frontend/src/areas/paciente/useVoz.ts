import { useCallback, useEffect, useRef, useState } from 'react'

// Tipos mínimos da API de reconhecimento de voz do navegador.
interface ResultadoDeVoz {
  isFinal: boolean
  0: { transcript: string }
}
interface EventoDeVoz {
  resultIndex: number
  results: ArrayLike<ResultadoDeVoz>
}
interface Reconhecedor {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((evento: EventoDeVoz) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

function construtorDoReconhecedor(): (new () => Reconhecedor) | null {
  const janela = window as unknown as Record<string, unknown>
  return (janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null) as (new () => Reconhecedor) | null
}

/** Entrada por voz (reconhecimento) e leitura em voz (síntese), pela API do navegador. */
export function useVoz(aoTranscrever: (texto: string) => void) {
  const [ouvindo, setOuvindo] = useState(false)
  const [parcial, setParcial] = useState('')
  const [falandoId, setFalandoId] = useState<string | null>(null)
  const reconhecedor = useRef<Reconhecedor | null>(null)
  const entrega = useRef(aoTranscrever)
  entrega.current = aoTranscrever

  const temReconhecimento = construtorDoReconhecedor() !== null
  const temLeitura = 'speechSynthesis' in window

  const ouvir = useCallback(() => {
    const Construtor = construtorDoReconhecedor()
    if (!Construtor) return
    const novo = new Construtor()
    novo.lang = 'pt-BR'
    novo.interimResults = true
    novo.continuous = false
    let final = ''
    novo.onresult = (evento) => {
      let provisorio = ''
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i]
        if (resultado.isFinal) final += resultado[0].transcript
        else provisorio += resultado[0].transcript
      }
      setParcial(final + provisorio)
    }
    novo.onerror = () => setOuvindo(false)
    novo.onend = () => {
      setOuvindo(false)
      setParcial('')
      const texto = final.trim()
      if (texto) entrega.current(texto)
    }
    reconhecedor.current = novo
    setParcial('')
    setOuvindo(true)
    novo.start()
  }, [])

  const pararDeOuvir = useCallback(() => reconhecedor.current?.stop(), [])

  const falar = useCallback(
    (id: string, texto: string) => {
      if (!temLeitura) return
      window.speechSynthesis.cancel()
      const fala = new SpeechSynthesisUtterance(texto)
      fala.lang = 'pt-BR'
      fala.rate = 0.95
      const voz = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt'))
      if (voz) fala.voice = voz
      fala.onend = () => setFalandoId((atual) => (atual === id ? null : atual))
      fala.onerror = () => setFalandoId((atual) => (atual === id ? null : atual))
      setFalandoId(id)
      window.speechSynthesis.speak(fala)
    },
    [temLeitura],
  )

  const calar = useCallback(() => {
    if (temLeitura) window.speechSynthesis.cancel()
    setFalandoId(null)
  }, [temLeitura])

  useEffect(
    () => () => {
      reconhecedor.current?.abort()
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  return { temReconhecimento, temLeitura, ouvindo, parcial, ouvir, pararDeOuvir, falar, calar, falandoId }
}
