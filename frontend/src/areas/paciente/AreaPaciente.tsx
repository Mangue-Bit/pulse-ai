import { useState } from 'react'

import { Presentation, Route, Stethoscope } from 'lucide-react'

import type { Paciente } from '@/api'
import { Selecao } from '@/componentes/basicos'
import { Button } from '@/componentes/ui/button'
import { useEstado } from '@/estado'
import { rotulo, SITUACAO } from '@/lib/formato'
import { cn } from '@/lib/utils'

import { CENARIOS } from './cenarios'
import { Avatar, Compositor, Mensagens } from './Conversa'
import { useConversa } from './useConversa'

function situacaoCurta(p: Paciente): string {
  if (p.situacao !== 'ativo') return rotulo(SITUACAO, p.situacao)
  if (!p.aceite_valido) return 'Ainda não autorizou o contato'
  return `${p.idade} anos`
}

function ListaDePacientes() {
  const { pacientes, paciente, escolherPaciente } = useEstado()
  const [termo, setTermo] = useState('')
  const normalizar = (valor: string) => valor.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
  const lista = (pacientes.dados ?? []).filter((p) => normalizar(p.nome).includes(normalizar(termo.trim())))
  return (
    <aside className="hidden min-h-0 flex-col border-r bg-card lg:flex" aria-label="Pacientes">
      <h2 className="px-5 pt-5 pb-3 text-lg font-bold tracking-tight">Pacientes</h2>
      <input type="search" aria-label="Buscar paciente" placeholder="Buscar paciente" value={termo}
        onChange={(e) => setTermo(e.target.value)} className="busca-paciente" />
      <ul className="rolagem flex min-h-0 flex-1 flex-col gap-0.5 px-2 pb-3">
        {lista.length === 0 && termo && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum paciente encontrado.</li>}
        {lista.map((p) => {
          const ativo = p.id === paciente?.id
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => escolherPaciente(p.id)}
                aria-current={ativo ? 'true' : undefined}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                  ativo ? 'bg-marca-suave' : 'hover:bg-muted',
                )}
              >
                <Avatar nome={p.nome} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.95rem] font-semibold">{p.nome}</span>
                  <span className="block truncate text-sm text-muted-foreground">{situacaoCurta(p)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

function PainelDeCenarios({ aoEscolher, ocupado }: { aoEscolher: (texto: string) => void; ocupado: boolean }) {
  const { irPara } = useEstado()
  return (
    <aside className="rolagem hidden min-h-0 flex-col gap-4 border-l bg-card px-5 py-5 xl:flex" aria-label="Experimente">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Experimente</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Escolha um cenário para preencher a mensagem.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {CENARIOS.map((cenario) => {
          const Icone = cenario.icone
          return (
            <li key={cenario.titulo}>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => aoEscolher(cenario.texto)}
                className="flex w-full flex-col gap-1.5 rounded-xl border bg-background/60 p-3 text-left transition-colors hover:border-foreground/25 hover:bg-card disabled:opacity-60"
              >
                <span className="flex items-center gap-2">
                  <span className={cn('flex size-7 items-center justify-center rounded-lg', cenario.cor)}>
                    <Icone className="size-4" aria-hidden />
                  </span>
                  <span className="font-semibold">{cenario.titulo}</span>
                </span>
                <span className="text-[0.95rem] leading-snug text-foreground/80 italic">“{cenario.texto}”</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-auto flex flex-col gap-1.5 border-t pt-4">
        <p className="text-sm text-muted-foreground">Depois de enviar, veja o outro lado:</p>
        <Button variant="outline" className="justify-start" onClick={() => irPara('palco')}>
          <Presentation data-icon="inline-start" />
          Tudo lado a lado
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => irPara('equipe')}>
          <Stethoscope data-icon="inline-start" />
          O que a equipe recebeu
        </Button>
        <Button variant="outline" className="justify-start" onClick={() => irPara('rastro')}>
          <Route data-icon="inline-start" />
          Como o Pulse decidiu
        </Button>
      </div>
    </aside>
  )
}

export function AreaPaciente() {
  const { pacientes, escolherPaciente } = useEstado()
  const conversa = useConversa()
  const { paciente, aceite } = conversa

  return (
    <div className="tela-paciente grid h-full">
      <ListaDePacientes />

      <section className="flex min-h-0 flex-col bg-background" aria-label="Conversa">
        <header className="flex items-center gap-3 border-b bg-card px-5 py-3">
          {paciente && <Avatar nome={paciente.nome} grande />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base leading-tight font-bold">{paciente?.nome ?? 'Nenhum paciente'}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {paciente ? `${paciente.idade} anos, ${paciente.microarea_nome}` : 'Escolha um paciente'}
            </p>
          </div>
          <Selecao
            aria-label="Paciente"
            value={paciente?.id ?? ''}
            onChange={(e) => escolherPaciente(e.target.value)}
            className="w-44 lg:hidden"
          >
            {(pacientes.dados ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Selecao>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void conversa.mudarAceite(!aceite)}
            disabled={!paciente}
            title={aceite ? 'O paciente autorizou o contato pelo Pulse' : 'O paciente ainda não autorizou o contato'}
          >
            {aceite ? 'Retirar autorização' : 'Autorizar contato'}
          </Button>
        </header>

        <div className="rolagem min-h-0 flex-1 px-4 py-6">
          <Mensagens conversa={conversa} dica="Escreva como o paciente escreveria, ou escolha uma das situações ao lado." />
        </div>

        <footer className="border-t bg-card px-4 pt-3 pb-4">
          <Compositor
            conversa={conversa}
            acima={
              <div className="atalhos-cenarios flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] xl:hidden">
                {CENARIOS.map((cenario) => (
                  <button
                    key={cenario.titulo}
                    type="button"
                    onClick={() => conversa.preencher(cenario.texto)}
                    className="shrink-0 rounded-full border bg-background px-3 py-1 text-sm font-medium text-foreground/80 hover:border-marca hover:text-marca"
                  >
                    {cenario.titulo}
                  </button>
                ))}
              </div>
            }
          />
        </footer>
      </section>

      <PainelDeCenarios aoEscolher={conversa.preencher} ocupado={conversa.enviando || !paciente} />
    </div>
  )
}
