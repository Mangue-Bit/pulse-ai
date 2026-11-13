"""Regra de conduta clínica (C18).

Nenhuma proposta do agente pode trazer dose, horário, troca ou interrupção de
medicamento. Esses padrões reprovam a proposta antes de qualquer modelo opinar.
"""

import re

from app.regras.urgencia import normalizar

PADROES: tuple[tuple[str, str], ...] = (
    (r"\b\d+([.,]\d+)? ?(mg|mcg|ml|g|gotas?|ui|unidades)\b", "quantidade de medicamento"),
    (r"\b(tome|tomar|tomando|use|usar|utilize|aplique|ingira) (\d+|um|uma|dois|duas|tres|meio|meia|metade)\b", "dose"),
    (r"\b(\d+|um|uma|dois|duas|tres|meio|meia) (comprimidos?|capsulas?|doses?|gotas)\b", "dose"),
    (r"\b(aumente|diminua|reduza|dobre|ajuste|aumentar|diminuir|reduzir|dobrar) (a |sua )?(dose|dosagem)\b", "mudança de dose"),
    (r"\b(suspenda|interrompa|pare de (tomar|usar)|deixe de (tomar|usar)|pode (parar|suspender|interromper))\b", "interrupção de medicamento"),
    (r"\b(troque|trocar|substitu\w+) (o |a |seu |sua |de )?(remedio|medicamento|comprimido)\b", "troca de medicamento"),
    (r"\b(de|a cada) \d+ (em \d+ )?horas?\b", "horário de uso"),
    (r"\bas \d{1,2}( ?h|:\d{2}| horas)\b", "horário de uso"),
    (r"\b(em jejum|antes de dormir|depois do almoco|apos as refeicoes)\b", "horário de uso"),
)


def conduta_clinica(texto: str) -> str | None:
    """Devolve o tipo de conduta clínica encontrado no texto, ou None."""
    normal = normalizar(texto)
    for padrao, tipo in PADROES:
        if re.search(padrao, normal):
            return tipo
    return None
