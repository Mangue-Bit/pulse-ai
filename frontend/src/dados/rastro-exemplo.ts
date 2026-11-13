// Gravação de exemplo do cenário 1 (relato de barreira), com dados sintéticos.
// Serve para reexibir o rastro sem depender do backend.

import type { Ator, Evento } from '@/api'

type Passo = {
  etapa: string
  ator: Ator
  entrada?: Record<string, unknown>
  saida: Record<string, unknown>
  chamada?: { versao_prompt: string; latencia_ms: number; tokens_entrada: number; tokens_saida: number; custo: number; modelo?: string }
  segundos: number
  interacao?: string
}

const FALA = 'não tô tomando o remédio da pressão, não consigo ler a receita'
const TRECHO = 'não consigo ler a receita'

const PASSOS: Passo[] = [
  { etapa: 'E01', ator: 'pessoa', entrada: { canal: 'texto' }, saida: { resumo: 'Mensagem recebida pelo chat', texto: FALA }, segundos: 0 },
  { etapa: 'E02', ator: 'regra', saida: { resumo: 'Texto normalizado; original guardado', texto: FALA }, segundos: 0 },
  {
    etapa: 'E03', ator: 'modelo', entrada: { regras_avaliadas: 14 },
    saida: { resumo: 'Nenhuma regra de urgência disparou e o modelo não indicou urgência', decisao: 'não' },
    chamada: { versao_prompt: 'interpretar_relato.v1', latencia_ms: 1840, tokens_entrada: 612, tokens_saida: 94, custo: 0.0043 },
    segundos: 2,
  },
  { etapa: 'E04', ator: 'regra', saida: { resumo: 'Aceite registrado e não revogado', decisao: 'sim' }, segundos: 2 },
  { etapa: 'E06', ator: 'modelo', saida: { resumo: 'Mensagem compreendida, certeza 0,93', decisao: 'sim', certeza: 0.93 }, segundos: 2 },
  { etapa: 'E08', ator: 'modelo', saida: { resumo: 'Não é dúvida clínica', decisao: 'não' }, segundos: 2 },
  {
    etapa: 'E10', ator: 'modelo',
    saida: { resumo: 'Barreira: dificuldade de leitura', barreira: 'analfabetismo', trecho_literal: TRECHO, certeza: 0.93 },
    segundos: 2,
  },
  { etapa: 'E11', ator: 'regra', saida: { resumo: 'Resposta enviada pelo modelo de resposta aprovado para a barreira', modelo_de_resposta: 'analfabetismo' }, segundos: 2 },
  { etapa: 'E12', ator: 'regra', saida: { resumo: 'Relato estruturado gravado; trecho literal marcado como dado', tipo: 'relato', barreira: 'analfabetismo' }, segundos: 2 },
  { etapa: 'C04', ator: 'regra', entrada: { origem: 'relato estruturado' }, saida: { resumo: 'Formato válido; texto do paciente isolado como dado', suspeita_de_instrucao: false }, segundos: 3 },
  { etapa: 'C05', ator: 'regra', saida: { resumo: 'Segunda checagem por regras: nenhum sinal de alarme', decisao: 'não' }, segundos: 3 },
  { etapa: 'C06', ator: 'regra', saida: { resumo: 'Tipo definido pela Escuta: relato', decisao: 'não' }, segundos: 3 },
  { etapa: 'C08', ator: 'regra', saida: { resumo: 'Caso aberto para a paciente na microárea Jardim das Acácias', rodada: 1 }, segundos: 3 },
  { etapa: 'C10', ator: 'regra', saida: { resumo: 'Paciente ativa: sem urgência nem internação', decisao: 'sim' }, segundos: 3 },
  { etapa: 'C12', ator: 'regra', entrada: { consulta: 'dificuldade de leitura, losartana' }, saida: { resumo: '4 trechos recuperados, cada um com a fonte', fontes: ['protocolo-adesao#3', 'protocolo-visita#2', 'bula-losartana#4', 'historico-relato-12'] }, segundos: 3 },
  {
    etapa: 'C13', ator: 'modelo', saida: { resumo: 'Contexto suficiente para seguir', decisao: 'sim' },
    chamada: { versao_prompt: 'delegar.v1', latencia_ms: 2210, tokens_entrada: 1480, tokens_saida: 61, custo: 0.0071 },
    segundos: 5,
  },
  { etapa: 'C15', ator: 'modelo', saida: { resumo: 'Relato de barreira: delegado ao Agente de Intervenção', especialistas: ['intervencao'] }, segundos: 5 },
  { etapa: 'I01', ator: 'regra', saida: { resumo: 'Fator de risco: dificuldade de leitura', fator: 'analfabetismo' }, segundos: 5 },
  { etapa: 'I02', ator: 'regra', saida: { resumo: '2 itens permitidos; áudio preferido para dificuldade de leitura', itens: ['audio-horarios', 'visita-caixa-organizadora'] }, segundos: 5 },
  {
    etapa: 'I03', ator: 'modelo',
    saida: { resumo: 'Proposta: mensagem em áudio com os horários dos remédios', ferramenta: 'enviar_mensagem', item_catalogo_id: 'audio-horarios', executada: false },
    chamada: { versao_prompt: 'escolher_intervencao.v1', latencia_ms: 3120, tokens_entrada: 1930, tokens_saida: 188, custo: 0.0115 },
    segundos: 8,
  },
  { etapa: 'C16', ator: 'regra', saida: { resumo: 'Uma proposta consolidada no caso' }, segundos: 8 },
  {
    etapa: 'C18', ator: 'modelo',
    saida: { resumo: 'Verificador aprovou: sem conduta clínica, com fonte, item do catálogo', decisao: 'sim' },
    chamada: { versao_prompt: 'verificar_proposta.v1', latencia_ms: 1560, tokens_entrada: 1210, tokens_saida: 72, custo: 0.0031, modelo: 'claude-sonnet-5-5' },
    segundos: 10,
  },
  { etapa: 'C20', ator: 'regra', saida: { resumo: 'Risco do item, pelo catálogo: alto', risco: 'alto' }, segundos: 10 },
  { etapa: 'C22', ator: 'regra', saida: { resumo: 'Proposta na fila de aprovação individual, com trecho literal e fontes' }, segundos: 10 },
  { etapa: 'C23', ator: 'pessoa', entrada: { profissional: 'Enf. Marina Duarte' }, saida: { resumo: 'Aprovada sem edição pela enfermeira', decisao: 'aprova' }, segundos: 46, interacao: 'int-gravacao-2' },
  { etapa: 'C26', ator: 'regra', saida: { resumo: 'Caso ativo, aceite válido e proposta dentro da validade', decisao: 'sim' }, segundos: 46, interacao: 'int-gravacao-2' },
  { etapa: 'C28', ator: 'ferramenta', entrada: { ferramenta: 'enviar_mensagem', canal: 'audio' }, saida: { resumo: 'enviar_mensagem executada com chave única', chave_unica: 'pro-gravacao:enviar_mensagem' }, segundos: 46, interacao: 'int-gravacao-2' },
  { etapa: 'E13', ator: 'regra', saida: { resumo: 'Mensagem aprovada entregue em áudio; aceite conferido na entrega', canal: 'audio' }, segundos: 46, interacao: 'int-gravacao-2' },
  { etapa: 'C29', ator: 'regra', saida: { resumo: 'Execução confirmada', decisao: 'sim' }, segundos: 46, interacao: 'int-gravacao-2' },
  { etapa: 'C31', ator: 'regra', saida: { resumo: 'Intervenção feita; caso aguarda o registro do resultado pelo ACS' }, segundos: 46, interacao: 'int-gravacao-2' },
]

const INICIO = new Date('2026-11-13T09:12:00').getTime()

export const RASTRO_DE_EXEMPLO: Evento[] = PASSOS.map((passo, indice) => ({
  id: `evt-gravacao-${String(indice + 1).padStart(2, '0')}`,
  caso_id: 'cas-gravacao',
  paciente_id: 'pac-gravacao',
  interacao_id: passo.interacao ?? 'int-gravacao-1',
  etapa: passo.etapa,
  ator: passo.ator,
  entrada: passo.entrada ?? {},
  saida: passo.saida,
  modelo: passo.chamada ? (passo.chamada.modelo ?? 'claude-opus-5-5') : null,
  versao_prompt: passo.chamada?.versao_prompt ?? null,
  latencia_ms: passo.chamada?.latencia_ms ?? null,
  tokens_entrada: passo.chamada?.tokens_entrada ?? null,
  tokens_saida: passo.chamada?.tokens_saida ?? null,
  custo: passo.chamada?.custo ?? null,
  criado_em: new Date(INICIO + passo.segundos * 1000).toISOString(),
}))

export const TITULO_DA_GRAVACAO = 'Relato de barreira: dificuldade de leitura'
