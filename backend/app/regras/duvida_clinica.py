"""Regra de dúvida clínica (E08).

Pergunta sobre dose, horário, troca, interrupção, mistura ou efeito do
tratamento nunca é respondida por agente: vai para a fila do profissional.
A regra roda antes do modelo e basta ela disparar para a mensagem ser tratada
como dúvida clínica. O modelo cobre o que a regra não pega.
"""

import re

from app.regras.urgencia import normalizar

PADROES: tuple[str, ...] = (
    r"\b(posso|pode|devo|deve|preciso|tenho que|da pra|da para) (tomar|parar|suspender|trocar|aumentar|diminuir|dobrar|dividir|cortar|misturar|beber|usar)\b",
    r"\b(qual|quanto|quantos|quantas) .{0,30}(dose|doses|dosagem|comprimido|comprimidos|gotas|mg|miligramas|vezes)\b",
    r"\b(me (diga|fala|fale|passa|passe|informa|informe)|qual e|qual a) .{0,20}(dose|dosagem)\b",
    r"\bdose\b.*\?",
    r"\b(faz|fazem) mal\b",
    r"\befeito(s)? colatera(l|is)\b",
    r"\b(pode|posso) (tomar|usar) (junto|com) ",
    r"\b(esqueci|esqueceu) .{0,40}(tomo|tomar) (agora|dois|duas|em dobro)\b",
    r"\b(e|eh) normal (sentir|ter|ficar)\b",
)


def e_duvida_clinica(texto: str) -> str | None:
    """Devolve o trecho que caracteriza a dúvida clínica, ou None."""
    normalizado = normalizar(texto)
    for padrao in PADROES:
        achado = re.search(padrao, normalizado)
        if achado:
            return achado.group(0)
    return None
