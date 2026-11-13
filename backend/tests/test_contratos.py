from datetime import datetime, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app import banco, contratos

AGORA = datetime(2026, 11, 13, 9, 0)


def test_relato_estruturado_valido():
    relato = contratos.RelatoEstruturado(
        id="rel-1", paciente_id="pac-1", tipo="relato", barreira="analfabetismo",
        lembrete=None, trecho_literal="não consigo ler a receita", certeza=0.9, criado_em=AGORA,
    )
    assert relato.barreira == "analfabetismo"


def test_relato_recusa_barreira_fora_do_catalogo():
    with pytest.raises(ValidationError):
        contratos.RelatoEstruturado(
            id="rel-1", paciente_id="pac-1", tipo="relato", barreira="preguica",
            lembrete=None, trecho_literal="x", certeza=0.9, criado_em=AGORA,
        )


@pytest.mark.parametrize("certeza", [-0.1, 1.5])
def test_relato_recusa_certeza_fora_do_intervalo(certeza):
    with pytest.raises(ValidationError):
        contratos.RelatoEstruturado(
            id="rel-1", paciente_id="pac-1", tipo="relato", barreira=None,
            lembrete=None, trecho_literal="x", certeza=certeza, criado_em=AGORA,
        )


def test_relato_recusa_tipo_desconhecido():
    with pytest.raises(ValidationError):
        contratos.RelatoEstruturado(
            id="rel-1", paciente_id="pac-1", tipo="ordem", barreira=None,
            lembrete=None, trecho_literal="x", certeza=0.5, criado_em=AGORA,
        )


def test_sinal_de_alarme_so_aceita_origens_conhecidas():
    contratos.SinalDeAlarme(
        id="sin-1", paciente_id="pac-1", origem="escuta", regra="dor_no_peito",
        trecho_literal="dor no peito", criado_em=AGORA,
    )
    with pytest.raises(ValidationError):
        contratos.SinalDeAlarme(
            id="sin-1", paciente_id="pac-1", origem="paciente", regra="x",
            trecho_literal="x", criado_em=AGORA,
        )


def test_duvida_vencida_valida():
    duvida = contratos.DuvidaVencida(
        id="duv-1", paciente_id="pac-1", relato_id="rel-1",
        prazo=AGORA, vencida_em=AGORA + timedelta(minutes=1),
    )
    assert duvida.vencida_em > duvida.prazo


def test_mensagem_aprovada_exige_aprovador_texto_e_chave():
    base = dict(
        id="msg-1", proposta_id="pro-1", paciente_id="pac-1", canal="audio",
        texto="Olá", aprovada_por="enf-1", aprovada_em=AGORA, chave_unica="pro-1:enviar_mensagem",
    )
    contratos.MensagemAprovada(**base)
    for campo in ("texto", "aprovada_por", "chave_unica"):
        with pytest.raises(ValidationError):
            contratos.MensagemAprovada(**{**base, campo: ""})
    with pytest.raises(ValidationError):
        contratos.MensagemAprovada(**{**base, "canal": "sms"})


def test_estado_do_caso_recusa_status_e_situacao_desconhecidos():
    base = dict(
        caso_id="cas-1", paciente_id="pac-1", microarea_id="ma-1", status="aberto",
        situacao_paciente="ativo", rodada=1, pendencias=[], validade=None,
    )
    contratos.EstadoDoCaso(**base)
    with pytest.raises(ValidationError):
        contratos.EstadoDoCaso(**{**base, "status": "talvez"})
    with pytest.raises(ValidationError):
        contratos.EstadoDoCaso(**{**base, "situacao_paciente": "sumido"})


def test_proposta_recusa_risco_e_estado_fora_da_lista():
    base = dict(
        id="pro-1", caso_id="cas-1", especialista="intervencao", item_catalogo_id="item-1",
        ferramenta="enviar_mensagem", argumentos={}, justificativa="", fontes=[],
        risco="baixo", estado="pendente", verificacao=None, validade=AGORA,
    )
    contratos.Proposta(**base)
    with pytest.raises(ValidationError):
        contratos.Proposta(**{**base, "risco": "medio"})
    with pytest.raises(ValidationError):
        contratos.Proposta(**{**base, "estado": "enviada"})
    with pytest.raises(ValidationError):
        contratos.Proposta(**{**base, "especialista": "clinico"})


def test_item_do_catalogo_e_fonte():
    item = contratos.ItemCatalogo(
        id="item-1", nome="Áudio", barreiras=["analfabetismo"], ferramenta="enviar_mensagem",
        risco="baixo", exige_aceite=True, canal_preferido="audio",
        modelo_de_mensagem="Olá, {nome}", taxa_sucesso=0.6, amostra=12,
    )
    assert item.canal_preferido == "audio"
    with pytest.raises(ValidationError):
        contratos.ItemCatalogo(**{**item.model_dump(), "barreiras": ["outra"]})
    with pytest.raises(ValidationError):
        contratos.Fonte(id="f1", origem="internet", titulo="t", trecho="x")


def test_evento_recusa_ator_desconhecido():
    base = dict(
        id="evt-1", caso_id=None, paciente_id="pac-1", interacao_id="int-1", etapa="E03",
        ator="regra", entrada={}, saida={}, modelo=None, versao_prompt=None, latencia_ms=None,
        tokens_entrada=None, tokens_saida=None, custo=None, criado_em=AGORA,
    )
    contratos.Evento(**base)
    with pytest.raises(ValidationError):
        contratos.Evento(**{**base, "ator": "agente"})


def test_todas_as_tabelas_da_secao_5_existem(banco_limpo):
    esperadas = {
        "paciente", "aceite", "microarea", "acs", "conversa", "relato", "caso", "proposta",
        "execucao", "tarefa_acs", "relatorio", "alerta", "duvida", "resultado", "evento",
    }
    assert esperadas <= set(inspect(banco.motor()).get_table_names())


def test_execucao_recusa_chave_unica_repetida(sessao):
    for _ in range(2):
        sessao.add(banco.Execucao(
            id=banco.novo_id("exe"), proposta_id="pro-1", ferramenta="enviar_mensagem",
            chave_unica="pro-1:enviar_mensagem", criado_em=AGORA,
        ))
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_campos_json_e_datas_sobrevivem_a_gravacao(sessao):
    sessao.add(banco.Proposta(
        id="pro-1", caso_id="cas-1", especialista="intervencao", ferramenta="enviar_mensagem",
        argumentos={"canal": "audio"}, fontes=[{"id": "f1"}], validade=AGORA, criado_em=AGORA,
    ))
    sessao.commit()
    with banco.sessao() as outra:
        lida = outra.get(banco.Proposta, "pro-1")
        assert lida.argumentos == {"canal": "audio"}
        assert lida.fontes == [{"id": "f1"}]
        assert lida.validade == AGORA
