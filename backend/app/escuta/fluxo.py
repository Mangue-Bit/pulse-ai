"""Máquina de estados da Escuta (E01 a E12).

O código é dono do fluxo: cada portão é uma regra em Python, e o modelo só é
consultado no ponto de chamada 1. A Escuta não age sobre o cuidado: o que sai
daqui é um RelatoEstruturado ou um SinalDeAlarme, entregue à fronteira.
"""

import re
from dataclasses import dataclass, field

from sqlmodel import Session

from app import banco, rastro, relogio
from app.contratos import RelatoEstruturado, SinalDeAlarme
from app.escuta import conversa, mensagens
from app.escuta.interpretacao import TAMANHO_DO_TRECHO, Triagem, triar
from app.regras import urgencia
from app.regras.aceite import aceite_valido
from app.regras.duvida_clinica import e_duvida_clinica
from app.regras.limites import CERTEZA_MINIMA, TAMANHO_MAXIMO_DA_MENSAGEM


@dataclass
class ResultadoEscuta:
    contexto: rastro.Contexto
    desfecho: str = ""       # urgencia | pedido_de_aceite | esclarecimento | encaminhado_a_equipe | duvida_clinica | relato
    mensagens: list[banco.Conversa] = field(default_factory=list)
    relato: RelatoEstruturado | None = None
    sinal: SinalDeAlarme | None = None


def normalizar(texto: str) -> str:
    """E02: espaços simples e tamanho limitado. O original fica guardado na conversa."""
    return re.sub(r"\s+", " ", texto).strip()[:TAMANHO_MAXIMO_DA_MENSAGEM]


class _Escuta:
    def __init__(self, s: Session, paciente_id: str, canal: str):
        self.s = s
        self.paciente_id = paciente_id
        self.canal = canal
        self.ctx = rastro.nova_interacao(s, paciente_id)
        self.sessao_id = conversa.sessao_atual(s, paciente_id)
        self.resultado = ResultadoEscuta(contexto=self.ctx)

    # --- utilitários ---------------------------------------------------------

    def _responder(self, texto: str, etapa: str, tipo: str = "fixa") -> None:
        self.resultado.mensagens.append(conversa.gravar(
            self.s, paciente_id=self.paciente_id, sessao_id=self.sessao_id, autor="pulse",
            texto=texto, tipo=tipo, etapa=etapa, canal=self.canal,
        ))

    def _registrar_relato(self, *, tipo: str, barreira: str | None, trecho: str,
                          certeza: float, lembrete: str | None) -> None:
        """E12: grava o relato estruturado. O trecho literal fica marcado como dado."""
        relato = RelatoEstruturado(
            id=banco.novo_id("rlt"), paciente_id=self.paciente_id, tipo=tipo, barreira=barreira,
            lembrete=lembrete, trecho_literal=trecho[:TAMANHO_DO_TRECHO], certeza=certeza,
            criado_em=relogio.agora(),
        )
        self.s.add(banco.Relato(**relato.model_dump(), interacao_id=self.ctx.interacao_id))
        self.s.commit()
        self.ctx.evento("E12", "regra", entrada={"tipo": tipo}, saida={
            "relato_id": relato.id, "tipo": tipo, "barreira": barreira, "certeza": certeza,
            "lembrete": lembrete, "trecho_literal_e_dado": True,
            "resumo": "Relato estruturado registrado. Atravessa a fronteira de permissão para o Cuidado.",
        })
        self.resultado.relato = relato

    def _sinalizar(self, regra: str, trecho: str) -> ResultadoEscuta:
        self.resultado.sinal = SinalDeAlarme(
            id=banco.novo_id("sin"), paciente_id=self.paciente_id, origem="escuta", regra=regra,
            trecho_literal=trecho[:TAMANHO_DO_TRECHO], criado_em=relogio.agora(),
        )
        self.resultado.desfecho = "urgencia"
        return self.resultado

    # --- etapas --------------------------------------------------------------

    def processar(self, texto_bruto: str) -> ResultadoEscuta:
        # E01: mensagem do paciente
        conversa.gravar(
            self.s, paciente_id=self.paciente_id, sessao_id=self.sessao_id, autor="paciente",
            texto=texto_bruto, tipo="mensagem", etapa="E01", canal=self.canal,
        )
        self.ctx.evento("E01", "pessoa", entrada={"canal": self.canal, "texto": texto_bruto}, saida={
            "resumo": "Mensagem do paciente recebida por voz." if self.canal == "audio"
            else "Mensagem do paciente recebida por texto.",
        })

        # E02: normaliza a entrada
        texto = normalizar(texto_bruto)
        self.ctx.evento("E02", "regra", entrada={"canal": self.canal}, saida={
            "caracteres": len(texto),
            "resumo": "Áudio transcrito no navegador. O original fica guardado na conversa."
            if self.canal == "audio" else "Texto normalizado. O original fica guardado na conversa.",
        })

        # E03: sinal de urgência? A regra roda antes do modelo.
        disparo = urgencia.detectar(texto)
        if disparo is not None:
            self.ctx.evento("E03", "regra", entrada={"texto": texto}, saida={
                "decisao": "sim", "regra": disparo.regra, "trecho": disparo.trecho,
                "resumo": f"Regra de urgência disparou: {disparo.descricao}. O modelo não é consultado.",
            })
            return self._sinalizar(disparo.regra, texto)
        self.ctx.evento("E03", "regra", entrada={"texto": texto}, saida={
            "decisao": "não", "resumo": "Nenhuma regra de urgência disparou. O modelo também avalia.",
        })

        triagem: Triagem | None = None
        chamada = None
        if texto:
            triagem, chamada = triar(texto)
            if triagem is None:
                self.ctx.evento("E03", "modelo", entrada={"texto": texto}, saida={
                    **chamada.resumo(),
                    "resumo": f"A chamada ao modelo falhou ({chamada.falha}). A mensagem segue para o caminho humano.",
                }, chamada=chamada.metricas)
            else:
                self.ctx.evento("E03", "modelo", entrada={"texto": texto}, saida={
                    "decisao": "sim" if triagem.urgencia else "não",
                    "resumo": "O modelo indicou possível urgência. Na dúvida, a resposta é sim."
                    if triagem.urgencia else "O modelo não indicou urgência.",
                }, chamada=chamada.metricas)
                if triagem.urgencia:
                    return self._sinalizar("modelo", texto)

        # E04: aceite válido?
        if not aceite_valido(self.s, self.paciente_id):
            self.ctx.evento("E04", "regra", saida={
                "decisao": "não", "resumo": "Paciente sem aceite válido.",
            })
            # E05: pede o aceite e avisa o ACS
            self._responder(mensagens.PEDIDO_DE_ACEITE, "E05")
            self.ctx.evento("E05", "regra", saida={
                "aviso_ao_acs": True,
                "resumo": "Mensagem fixa pedindo o aceite. O ACS da área é avisado para procurar o paciente.",
            })
            self.resultado.desfecho = "pedido_de_aceite"
            return self.resultado
        self.ctx.evento("E04", "regra", saida={
            "decisao": "sim", "resumo": "Aceite registrado e não revogado.",
        })

        # Falha do modelo: nunca vira resposta ao paciente. Segue para a equipe (E07).
        if triagem is None:
            motivo = "A mensagem veio vazia." if not texto else "O modelo não respondeu."
            self.ctx.evento("E06", "regra", saida={
                "decisao": "não", "resumo": f"{motivo} A mensagem não foi interpretada.",
            })
            if not texto:
                return self._pedir_esclarecimento(texto, certeza=0.0)
            return self._encaminhar_a_equipe(texto, certeza=0.0)

        # E06: deu para entender? A regra de dúvida clínica também conta como entendimento.
        trecho_de_duvida = e_duvida_clinica(texto)
        entendida = bool(trecho_de_duvida) or (
            triagem.entendivel and (triagem.duvida_clinica or triagem.certeza >= CERTEZA_MINIMA)
        )
        self.ctx.evento("E06", "modelo", saida={
            "decisao": "sim" if entendida else "não", "certeza": triagem.certeza,
            "certeza_minima": CERTEZA_MINIMA,
            "resumo": "A mensagem foi entendida." if entendida
            else f"Certeza de {triagem.certeza:.2f}, abaixo do mínimo de {CERTEZA_MINIMA:.2f}.",
        })
        if not entendida:
            return self._pedir_esclarecimento(texto, certeza=triagem.certeza)

        # E08: dúvida clínica? A regra roda antes; o modelo cobre o que ela não pega.
        if trecho_de_duvida or triagem.duvida_clinica:
            self.ctx.evento("E08", "regra" if trecho_de_duvida else "modelo", saida={
                "decisao": "sim",
                "resumo": "É dúvida clínica. O agente nunca responde esse tipo de pergunta.",
            })
            # E09: mensagem fixa
            self._responder(mensagens.DUVIDA_CLINICA, "E09")
            self.ctx.evento("E09", "regra", saida={
                "resumo": "Mensagem fixa: um profissional responde dentro do prazo.",
            })
            self._registrar_relato(
                tipo="duvida", barreira=None, trecho=texto, certeza=triagem.certeza, lembrete=None,
            )
            self.resultado.desfecho = "duvida_clinica"
            return self.resultado
        self.ctx.evento("E08", "modelo", saida={
            "decisao": "não", "resumo": "Não é dúvida clínica.",
        })

        # E10: interpreta o relato (saída estruturada da mesma chamada do ponto 1)
        barreira = triagem.barreira or "nao_identificada"
        self.ctx.evento("E10", "modelo", saida={
            "barreira": barreira, "trecho_literal": triagem.trecho_literal,
            "certeza": triagem.certeza, "lembrete": triagem.lembrete,
            "versao_prompt": chamada.metricas.versao_prompt,
            "resumo": f"Barreira do catálogo: {barreira}, com certeza de {triagem.certeza:.2f}.",
        })

        # E11: responde só com modelo de resposta aprovado
        self._responder(
            mensagens.resposta_ao_relato(barreira, com_lembrete=bool(triagem.lembrete)),
            "E11", tipo="resposta",
        )
        self.ctx.evento("E11", "regra", saida={
            "modelo_de_resposta": barreira, "lembrete_anotado": bool(triagem.lembrete),
            "resumo": "Resposta escolhida entre os modelos aprovados, sem texto livre.",
        })

        # E12: registra o relato estruturado
        self._registrar_relato(
            tipo="relato", barreira=barreira, trecho=triagem.trecho_literal,
            certeza=triagem.certeza, lembrete=triagem.lembrete,
        )
        self.resultado.desfecho = "relato"
        return self.resultado

    # --- E07 -----------------------------------------------------------------

    def _pedir_esclarecimento(self, texto: str, certeza: float) -> ResultadoEscuta:
        """E07: pede esclarecimento. Na segunda vez na sessão, o caso vai para a equipe."""
        if conversa.esclarecimentos_na_sessao(self.s, self.paciente_id, self.sessao_id) >= 1:
            return self._encaminhar_a_equipe(texto, certeza)
        self._responder(mensagens.PEDIDO_DE_ESCLARECIMENTO, "E07")
        self.ctx.evento("E07", "regra", saida={
            "tentativa": 1, "resumo": "Mensagem fixa pedindo esclarecimento.",
        })
        self.resultado.desfecho = "esclarecimento"
        return self.resultado

    def _encaminhar_a_equipe(self, texto: str, certeza: float) -> ResultadoEscuta:
        self._responder(mensagens.ENCAMINHADO_A_EQUIPE, "E07")
        self.ctx.evento("E07", "regra", saida={
            "encaminhado_a_equipe": True,
            "resumo": "Sem interpretação confiável: a mensagem vai para a equipe, sem resposta de agente.",
        })
        self._registrar_relato(
            tipo="relato", barreira="nao_identificada", trecho=texto or "(mensagem vazia)",
            certeza=certeza, lembrete=None,
        )
        self.resultado.desfecho = "encaminhado_a_equipe"
        return self.resultado


def processar_mensagem(s: Session, paciente_id: str, texto: str, canal: str = "texto") -> ResultadoEscuta:
    """Entrada da Escuta: recebe a mensagem do paciente e percorre E01 a E12."""
    return _Escuta(s, paciente_id, canal).processar(texto)
