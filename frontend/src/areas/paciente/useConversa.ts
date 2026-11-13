import { useEffect, useRef, useState } from 'react'

import { api, type Canal } from '@/api'
import { useEstado } from '@/estado'
import { useConsulta } from '@/lib/consulta'
import { rolarAteOFim } from '@/lib/rolagem'

import { useVoz } from './useVoz'

export function useConversa() {
  const { paciente, conectado, pacientes, propostas } = useEstado()
  const pacienteId = paciente?.id ?? ''
  const conversa = useConsulta(() => api.conversa(pacienteId), 1500, pacienteId, conectado && pacienteId !== '')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const jaVistas = useRef<Set<string> | null>(null)

  const enviar = async (conteudo: string, canal: Canal) => {
    const limpo = conteudo.trim()
    if (!limpo || !pacienteId || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      await api.enviarMensagem(pacienteId, limpo, canal)
      setTexto('')
      await conversa.recarregar()
    } catch {
      setErro('A mensagem não foi enviada. Confira se o serviço está no ar e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  const voz = useVoz((transcricao) => void enviar(transcricao, 'audio'))
  const mensagens = conversa.dados?.mensagens ?? []
  const aceite = conversa.dados?.aceite_valido ?? paciente?.aceite_valido ?? false
  const ultimaId = mensagens.length ? mensagens[mensagens.length - 1].id : ''

  const { falar } = voz
  useEffect(() => {
    rolarAteOFim(fim.current)
    if (!conversa.dados) return
    if (jaVistas.current === null) {
      jaVistas.current = new Set(conversa.dados.mensagens.map((m) => m.id))
      return
    }
    for (const mensagem of conversa.dados.mensagens) {
      if (jaVistas.current.has(mensagem.id)) continue
      jaVistas.current.add(mensagem.id)
      if (mensagem.autor !== 'paciente' && mensagem.canal === 'audio') falar(mensagem.id, mensagem.texto)
    }
  }, [ultimaId, conversa.dados, falar])

  useEffect(() => {
    jaVistas.current = null
    setAviso(null)
    setErro(null)
  }, [pacienteId])

  const mudarAceite = async (registrar: boolean) => {
    if (!pacienteId) return
    try {
      const estado = registrar ? await api.registrarAceite(pacienteId) : await api.revogarAceite(pacienteId)
      setAviso(
        registrar
          ? 'Contato autorizado.'
          : estado.propostas_canceladas > 0
            ? `Autorização retirada. ${estado.propostas_canceladas} sugestão(ões) pendente(s) cancelada(s).`
            : 'Autorização retirada. O Pulse não envia mais mensagens a este paciente.',
      )
      await Promise.all([conversa.recarregar(), pacientes.recarregar(), propostas.recarregar()])
    } catch {
      setErro('Não foi possível alterar a autorização.')
    }
  }

  const preencher = (conteudo: string) => {
    setTexto(conteudo)
    campo.current?.focus()
  }

  return {
    paciente,
    conectado,
    mensagens,
    aceite,
    texto,
    definirTexto: setTexto,
    enviando,
    erro,
    aviso,
    enviar,
    preencher,
    mudarAceite,
    voz,
    campo,
    fim,
  }
}

export type ConversaDoPaciente = ReturnType<typeof useConversa>
