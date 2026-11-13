"""E13: o paciente recebe a mensagem aprovada pela equipe.

A entrega só acontece com aceite válido e com a mensagem já aprovada por uma
pessoa. Na demonstração, o canal é o chat web no lugar do WhatsApp.
"""

from app import rastro
from app.contratos import MensagemAprovada
from app.escuta import conversa
from app.regras.aceite import aceite_valido


def entregar(ctx: rastro.Contexto, mensagem: MensagemAprovada) -> bool:
    """Grava a mensagem na conversa do paciente. Devolve False se não puder entregar."""
    if not aceite_valido(ctx.sessao, mensagem.paciente_id):
        ctx.evento("E13", "regra", entrada={"proposta_id": mensagem.proposta_id}, saida={
            "entregue": False, "resumo": "Sem aceite válido, a mensagem não é entregue.",
        })
        return False
    gravada = conversa.gravar(
        ctx.sessao, paciente_id=mensagem.paciente_id,
        sessao_id=conversa.sessao_atual(ctx.sessao, mensagem.paciente_id),
        autor="equipe", texto=mensagem.texto, tipo="aprovada", etapa="E13", canal=mensagem.canal,
    )
    ctx.evento("E13", "ferramenta", entrada={
        "proposta_id": mensagem.proposta_id, "aprovada_por": mensagem.aprovada_por,
        "chave_unica": mensagem.chave_unica,
    }, saida={
        "entregue": True, "mensagem_id": gravada.id, "canal": mensagem.canal,
        "resumo": f"Mensagem aprovada pela equipe entregue ao paciente em {'áudio' if mensagem.canal == 'audio' else 'texto'}.",
    })
    return True
