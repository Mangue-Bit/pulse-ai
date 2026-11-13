"""Mensagens fixas e modelos de resposta aprovados da Escuta.

A Escuta nunca escreve texto livre: toda resposta ao paciente sai daqui. Os
textos são de demonstração e precisam de validação da equipe de saúde.
"""

from app.regras.limites import PRAZO_DA_DUVIDA, em_palavras

PEDIDO_DE_ACEITE = (
    "Olá! Para conversar com você por aqui, a equipe da unidade de saúde precisa do seu aceite. "
    "Sem ele, eu só posso avisar o agente de saúde da sua área, que vai procurar você. "
    "Se for uma emergência, ligue 192 ou vá à UPA."
)

PEDIDO_DE_ESCLARECIMENTO = (
    "Não consegui entender bem a sua mensagem. Pode me contar de novo, com outras palavras, "
    "o que está dificultando o uso dos seus remédios?"
)

ENCAMINHADO_A_EQUIPE = (
    "Obrigado por escrever. Vou passar a sua mensagem para a equipe da unidade de saúde, "
    "e uma pessoa da equipe vai procurar você."
)

DUVIDA_CLINICA = (
    "Essa é uma pergunta que só um profissional de saúde pode responder. Já encaminhei para a "
    f"equipe da unidade, e um profissional responde em até {em_palavras(PRAZO_DA_DUVIDA)}. "
    "Se sentir algo grave, ligue 192 ou vá à UPA."
)

# Modelos de resposta aprovados, um por barreira (E11).
RESPOSTA_POR_BARREIRA = {
    "analfabetismo": (
        "Obrigado por contar. Entendi que está difícil ler a receita ou as caixas dos remédios. "
        "Vou passar isso para a equipe da unidade de saúde, que vai ver a melhor forma de ajudar você."
    ),
    "muitos_medicamentos": (
        "Obrigado por contar. Entendi que são muitos remédios e que os horários confundem. "
        "Vou passar isso para a equipe da unidade de saúde, que vai ver a melhor forma de ajudar você."
    ),
    "rede_de_apoio": (
        "Obrigado por contar. Entendi que falta alguém para ajudar você com os remédios no dia a dia. "
        "Vou passar isso para a equipe da unidade de saúde, que vai ver a melhor forma de ajudar você."
    ),
    "acesso_a_remedios": (
        "Obrigado por contar. Entendi que está difícil conseguir o remédio. "
        "Vou passar isso para a equipe da unidade de saúde, que vai ver a melhor forma de ajudar você."
    ),
    "percepcao_de_melhora": (
        "Obrigado por contar como você está. "
        "Vou passar o seu recado para a equipe da unidade de saúde, que vai conversar com você sobre o tratamento."
    ),
    "nao_identificada": (
        "Obrigado por contar. Vou passar o seu recado para a equipe da unidade de saúde."
    ),
}

LEMBRETE_ANOTADO = " Anotei também o seu pedido de lembrete para a equipe."


def resposta_ao_relato(barreira: str, com_lembrete: bool) -> str:
    texto = RESPOSTA_POR_BARREIRA[barreira]
    return texto + LEMBRETE_ANOTADO if com_lembrete else texto
