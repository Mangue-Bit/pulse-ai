"""Prazos, limites e limiares do fluxo. São regras em código, nunca decisão do modelo."""

from datetime import datetime, timedelta

# Escuta
CERTEZA_MINIMA = 0.5                       # abaixo disso, a mensagem não foi entendida (E06)
JANELA_DA_SESSAO = timedelta(minutes=30)   # memória curta da Escuta
RETENCAO_DA_CONVERSA = timedelta(days=7)   # a conversa bruta expira antes do histórico
TAMANHO_MAXIMO_DA_MENSAGEM = 2000

# Fila do profissional (C07)
PRAZO_DA_DUVIDA = timedelta(hours=4)

# Trilha de urgência (U02): prazo de confirmação de cada nível da cadeia
PRAZO_DO_ALERTA = {
    "plantao": timedelta(minutes=10),
    "enfermeiro": timedelta(minutes=15),
    "gestor": timedelta(minutes=20),
}

# Fila de aprovação (C23, C25)
VALIDADE_DA_PROPOSTA = timedelta(hours=48)
LEMBRETE_DA_PROPOSTA = timedelta(hours=24)

# Execução (C30)
TENTATIVAS_DE_EXECUCAO = 3

# Desfecho (C34, C35, C38)
PRAZO_DO_RESULTADO = timedelta(days=7)
PRAZO_DA_TAREFA = timedelta(days=5)
LIMITE_DE_RODADAS_ALTO_RISCO = 2
LIMITE_DE_RODADAS = 3

# Ciclo de aprendizado (C40)
AMOSTRA_MINIMA = 10


def limite_de_rodadas(alto_risco: bool) -> int:
    return LIMITE_DE_RODADAS_ALTO_RISCO if alto_risco else LIMITE_DE_RODADAS


def unidade_aberta(momento: datetime) -> bool:
    """Horário de funcionamento da unidade: segunda a sexta, das 7h às 17h."""
    return momento.weekday() < 5 and 7 <= momento.hour < 17


def em_palavras(prazo: timedelta) -> str:
    minutos = int(prazo.total_seconds() // 60)
    if minutos % (60 * 24) == 0:
        dias = minutos // (60 * 24)
        return "1 dia" if dias == 1 else f"{dias} dias"
    if minutos % 60 == 0:
        horas = minutos // 60
        return "1 hora" if horas == 1 else f"{horas} horas"
    return f"{minutos} minutos"
