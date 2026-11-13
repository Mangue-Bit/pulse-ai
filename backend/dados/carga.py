"""Carga de dados sintéticos do Pulse.

Uso, a partir da pasta backend:
    python -m dados.carga              recria o banco com os dados da demonstração
    python -m dados.carga --se-vazio   só carrega se o banco ainda não tiver pacientes

Todos os nomes, pacientes e registros são fictícios. A nota de risco de
abandono é um número pronto, no lugar do modelo de risco (etapa C01).
"""

import sys
from datetime import timedelta

from sqlmodel import Session, select

from app import banco, rastro, relogio
from app.regras.catalogo import item_por_id

MICROAREAS = [
    ("ma-01", "Microárea 1 · Vila Esperança"),
    ("ma-02", "Microárea 2 · Jardim das Flores"),
    ("ma-03", "Microárea 3 · Alto da Serra"),
]

AGENTES = [
    ("acs-01", "Rosana Lima", "ma-01"),
    ("acs-02", "Edmilson Souza", "ma-02"),
    ("acs-03", "Tereza Nunes", "ma-03"),
]

# id, nome, idade, microárea, ACS, condições, medicamentos, situação, risco, alto risco, aceite
PACIENTES = [
    ("pac-01", "Maria das Dores Silva", 68, "ma-01", "acs-01", ["hipertensão"],
     ["losartana potássica", "hidroclorotiazida"], "ativo", 0.72, True, "valido"),
    ("pac-02", "José Raimundo Alves", 74, "ma-01", "acs-01", ["hipertensão", "diabetes tipo 2"],
     ["losartana potássica", "besilato de anlodipino", "hidroclorotiazida", "cloridrato de metformina",
      "glibenclamida", "sinvastatina"], "ativo", 0.81, True, "valido"),
    ("pac-03", "Antônia Ferreira", 59, "ma-02", "acs-02", ["diabetes tipo 2"],
     ["cloridrato de metformina", "glibenclamida"], "ativo", 0.44, False, "valido"),
    ("pac-04", "Francisco Pereira", 63, "ma-02", "acs-02", ["hipertensão"],
     ["maleato de enalapril"], "ativo", 0.58, False, "nunca"),
    ("pac-05", "Luzia Barbosa", 81, "ma-03", "acs-03", ["hipertensão", "diabetes tipo 2"],
     ["besilato de anlodipino", "cloridrato de metformina"], "internado", 0.66, True, "valido"),
    ("pac-06", "Sebastião Gomes", 70, "ma-03", "acs-03", ["hipertensão"],
     ["losartana potássica"], "ativo", 0.31, False, "valido"),
    ("pac-07", "Raimunda Costa", 66, "ma-01", "acs-01", ["diabetes tipo 2"],
     ["cloridrato de metformina"], "ativo", 0.77, True, "valido"),
    ("pac-08", "João Batista Rocha", 55, "ma-02", "acs-02", ["hipertensão"],
     ["maleato de enalapril", "hidroclorotiazida"], "aceite_revogado", 0.49, False, "revogado"),
    ("pac-09", "Benedita Santos", 77, "ma-03", "acs-03", ["hipertensão"],
     ["besilato de anlodipino", "sinvastatina"], "ativo", 0.63, False, "valido"),
    ("pac-10", "Manoel Carvalho", 61, "ma-01", "acs-01", ["hipertensão", "diabetes tipo 2"],
     ["losartana potássica", "cloridrato de metformina"], "ativo", 0.52, False, "valido"),
    ("pac-11", "Josefa Ribeiro", 72, "ma-02", "acs-02", ["hipertensão"],
     ["hidroclorotiazida"], "ativo", 0.27, False, "valido"),
    ("pac-12", "Pedro Henrique Araújo", 58, "ma-03", "acs-03", ["diabetes tipo 2"],
     ["cloridrato de metformina"], "ativo", 0.36, False, "valido"),
]


def _mensagem(item_id: str, nome: str, acs: str) -> str:
    item = item_por_id(item_id)
    return item.modelo_de_mensagem.format(nome=nome.split()[0], acs=acs.split()[0])


def _caso(s: Session, agora, *, caso_id, paciente_id, microarea_id, status, barreira, rodada=1,
          dias_atras=2, desfecho=None, recebeu=False, validade=None) -> banco.Caso:
    caso = banco.Caso(
        id=caso_id, paciente_id=paciente_id, microarea_id=microarea_id, status=status,
        rodada=rodada, pendencias=[], validade=validade, barreira=barreira, desfecho=desfecho,
        recebeu_intervencao=recebeu, aberto_em=agora - timedelta(days=dias_atras),
        atualizado_em=agora - timedelta(hours=3),
    )
    s.add(caso)
    return caso


def _relato(s: Session, agora, *, relato_id, paciente_id, barreira, trecho, dias_atras=2, certeza=0.86):
    s.add(banco.Relato(
        id=relato_id, paciente_id=paciente_id, tipo="relato", barreira=barreira, lembrete=None,
        trecho_literal=trecho, certeza=certeza, criado_em=agora - timedelta(days=dias_atras),
    ))


def _proposta(s: Session, agora, *, proposta_id, caso_id, relato_id, item_id, paciente, acs,
              estado, fontes, justificativa, horas_atras=5, decidida_por=None, motivo=None,
              canal=None) -> banco.Proposta:
    item = item_por_id(item_id)
    texto = _mensagem(item_id, paciente.nome, acs.nome)
    if item.ferramenta == "enviar_mensagem":
        argumentos = {
            "paciente_id": paciente.id, "modelo_de_mensagem": item.id,
            "variaveis": {"nome": paciente.nome.split()[0], "acs": acs.nome.split()[0]},
            "canal": canal or item.canal_preferido, "texto": texto,
        }
    else:
        argumentos = {
            "paciente_id": paciente.id, "acs_id": acs.id, "tipo": "visita",
            "descricao": texto, "prazo": (agora + timedelta(days=5)).isoformat(),
        }
    criada = agora - timedelta(hours=horas_atras)
    proposta = banco.Proposta(
        id=proposta_id, caso_id=caso_id, relato_id=relato_id, especialista="intervencao",
        item_catalogo_id=item.id, ferramenta=item.ferramenta, argumentos=argumentos,
        justificativa=justificativa, fontes=fontes, risco=item.risco, estado=estado,
        verificacao=None, validade=criada + timedelta(hours=48), criado_em=criada,
        decidida_por=decidida_por, decidida_em=criada + timedelta(hours=1) if decidida_por else None,
        motivo=motivo,
    )
    s.add(proposta)
    return proposta


FONTE_LEITURA = {
    "id": "protocolo-adesao#dificuldade-de-leitura", "origem": "protocolo",
    "titulo": "Apoio à adesão ao tratamento na atenção primária (protocolo sintético) · Dificuldade de leitura",
    "trecho": "Quando a pessoa não consegue ler a receita ou as embalagens, a equipe prefere orientação falada, "
              "por áudio ou presencial, e apoio visual: caixas marcadas com desenhos do horário (manhã, tarde, noite).",
}
FONTE_MUITOS = {
    "id": "protocolo-adesao#muitos-medicamentos", "origem": "protocolo",
    "titulo": "Apoio à adesão ao tratamento na atenção primária (protocolo sintético) · Muitos medicamentos",
    "trecho": "Quando a pessoa usa vários medicamentos e se confunde com os horários, a equipe oferece um quadro "
              "simples de horários, feito a partir da receita, e a organização das caixas.",
}
FONTE_ACESSO = {
    "id": "protocolo-adesao#dificuldade-de-acesso-aos-medicamentos", "origem": "protocolo",
    "titulo": "Apoio à adesão ao tratamento na atenção primária (protocolo sintético) · Dificuldade de acesso aos medicamentos",
    "trecho": "Quando o medicamento falta, a equipe verifica o motivo: receita vencida, falta na unidade, distância "
              "ou custo. A farmácia da unidade confere a receita e orienta a retirada.",
}
FONTE_MELHORA = {
    "id": "protocolo-adesao#percepcao-de-melhora", "origem": "protocolo",
    "titulo": "Apoio à adesão ao tratamento na atenção primária (protocolo sintético) · Percepção de melhora",
    "trecho": "Quando a pessoa interrompe o tratamento por se sentir bem, a equipe convida para uma conversa antes "
              "de qualquer mudança.",
}
FONTE_APOIO = {
    "id": "protocolo-adesao#falta-de-rede-de-apoio", "origem": "protocolo",
    "titulo": "Apoio à adesão ao tratamento na atenção primária (protocolo sintético) · Falta de rede de apoio",
    "trecho": "Quando a pessoa mora só ou não tem quem ajude, a equipe procura identificar um familiar, vizinho "
              "ou cuidador que possa apoiar a rotina.",
}


def carregar(s: Session) -> dict:
    """Apaga tudo e recria os dados da demonstração. Devolve as contagens."""
    banco.apagar_tudo()
    relogio.recarregar()
    agora = relogio.agora()

    for microarea_id, nome in MICROAREAS:
        s.add(banco.Microarea(id=microarea_id, nome=nome))
    agentes = {}
    for acs_id, nome, microarea_id in AGENTES:
        agentes[acs_id] = banco.Acs(id=acs_id, nome=nome, microarea_id=microarea_id)
        s.add(agentes[acs_id])
    pacientes = {}
    for pid, nome, idade, ma, acs, condicoes, remedios, situacao, risco, alto, aceite in PACIENTES:
        pacientes[pid] = banco.Paciente(
            id=pid, nome=nome, idade=idade, microarea_id=ma, acs_id=acs, condicoes=condicoes,
            medicamentos=remedios, situacao=situacao, risco_abandono=risco, alto_risco=alto,
        )
        s.add(pacientes[pid])
        if aceite != "nunca":
            s.add(banco.Aceite(
                id=f"ace-{pid}", paciente_id=pid, registrado_em=agora - timedelta(days=60),
                revogado_em=agora - timedelta(days=1) if aceite == "revogado" else None,
            ))

    # Histórico de Maria das Dores: um relatório anterior, usado como fonte pelo RAG.
    s.add(banco.Relatorio(
        id="rel-hist-01", paciente_id="pac-01", caso_id=None, proposta_id=None,
        frases=[
            {"texto": "Na visita de outubro, a paciente guardava os remédios soltos em uma lata, fora das caixas.",
             "fonte_id": "registro-acs-outubro"},
            {"texto": "A paciente contou que a neta, que lia a receita para ela, mudou de cidade.",
             "fonte_id": "registro-acs-outubro"},
        ],
        criado_em=agora - timedelta(days=21),
    ))

    # Caso aberto: relato recebido, ainda sem proposta.
    _relato(s, agora, relato_id="rlt-10", paciente_id="pac-10", barreira="nao_identificada",
            trecho="tem dia que eu tomo, tem dia que não", dias_atras=1, certeza=0.55)
    _caso(s, agora, caso_id="cas-10", paciente_id="pac-10", microarea_id="ma-01", status="aberto",
          barreira="nao_identificada", dias_atras=1)
    s.add(banco.TarefaAcs(
        id="tar-10", paciente_id="pac-10", acs_id="acs-01", caso_id="cas-10", tipo="tarefa_manual",
        descricao="Nenhum item do catálogo se aplica ao relato. Conversar com Manoel para entender o que dificulta o uso dos remédios.",
        prazo=agora + timedelta(days=3), origem="manual", criado_em=agora - timedelta(days=1),
    ))

    # Caso aguardando aprovação: proposta pendente na fila.
    _relato(s, agora, relato_id="rlt-02", paciente_id="pac-02", barreira="muitos_medicamentos",
            trecho="é remédio demais, eu me atrapalho com os horários", dias_atras=1)
    _caso(s, agora, caso_id="cas-02", paciente_id="pac-02", microarea_id="ma-01",
          status="aguardando_aprovacao", barreira="muitos_medicamentos", dias_atras=1,
          validade=agora + timedelta(hours=43))
    _proposta(s, agora, proposta_id="pro-02", caso_id="cas-02", relato_id="rlt-02",
              item_id="mensagem_quadro_de_horarios", paciente=pacientes["pac-02"], acs=agentes["acs-01"],
              estado="pendente", fontes=[FONTE_MUITOS],
              justificativa="O paciente relata confusão com os horários de seis medicamentos. O protocolo indica oferecer um quadro simples de horários feito a partir da receita.")

    # Caso aguardando resultado: mensagem enviada, falta o registro do ACS.
    _relato(s, agora, relato_id="rlt-03", paciente_id="pac-03", barreira="acesso_a_remedios",
            trecho="o remédio acabou e no posto não tinha", dias_atras=4)
    _caso(s, agora, caso_id="cas-03", paciente_id="pac-03", microarea_id="ma-02",
          status="aguardando_resultado", barreira="acesso_a_remedios", dias_atras=4, recebeu=True,
          validade=agora + timedelta(days=3))
    enviada = _proposta(s, agora, proposta_id="pro-03", caso_id="cas-03", relato_id="rlt-03",
                        item_id="mensagem_retirada_de_remedios", paciente=pacientes["pac-03"],
                        acs=agentes["acs-02"], estado="executada", fontes=[FONTE_ACESSO], horas_atras=70,
                        decidida_por="prof-enfermeira",
                        justificativa="A paciente relata falta do medicamento na unidade. O protocolo indica que a farmácia confira a receita e oriente a retirada.")
    s.add(banco.Execucao(
        id="exe-03", proposta_id="pro-03", ferramenta="enviar_mensagem",
        chave_unica="pro-03:enviar_mensagem", status="confirmada", tentativas=1,
        resultado={"entregue": True}, criado_em=agora - timedelta(hours=69),
    ))
    s.add(banco.Conversa(
        id="msg-hist-03", paciente_id="pac-03", sessao_id="ses-hist-03", autor="equipe", canal="texto",
        texto=enviada.argumentos["texto"], tipo="aprovada", etapa="E13",
        criado_em=agora - timedelta(hours=69), expira_em=agora + timedelta(days=4),
    ))

    # Caso resolvido: resultado registrado, barreira superada.
    _relato(s, agora, relato_id="rlt-06", paciente_id="pac-06", barreira="percepcao_de_melhora",
            trecho="parei porque a pressão tá boa", dias_atras=20)
    _caso(s, agora, caso_id="cas-06", paciente_id="pac-06", microarea_id="ma-03", status="resolvido",
          barreira="percepcao_de_melhora", dias_atras=20, desfecho="resolvido", recebeu=True)
    _proposta(s, agora, proposta_id="pro-06", caso_id="cas-06", relato_id="rlt-06",
              item_id="mensagem_conversa_antes_de_parar", paciente=pacientes["pac-06"], acs=agentes["acs-03"],
              estado="executada", fontes=[FONTE_MELHORA], horas_atras=20 * 24 - 4,
              decidida_por="prof-enfermeira",
              justificativa="O paciente interrompeu o uso por se sentir bem. O protocolo indica convidar para uma conversa antes de qualquer mudança.")
    s.add(banco.Execucao(
        id="exe-06", proposta_id="pro-06", ferramenta="enviar_mensagem",
        chave_unica="pro-06:enviar_mensagem", resultado={"entregue": True},
        criado_em=agora - timedelta(days=19),
    ))
    s.add(banco.Resultado(
        id="res-06", caso_id="cas-06", proposta_id="pro-06",
        item_catalogo_id="mensagem_conversa_antes_de_parar", barreira_resolvida=True,
        observacao="Paciente foi à unidade, conversou com a enfermeira e voltou a usar o remédio.",
        registrado_por="acs-03", criado_em=agora - timedelta(days=12),
    ))

    # Caso em busca ativa: limite de rodadas atingido sem resolver.
    _relato(s, agora, relato_id="rlt-07", paciente_id="pac-07", barreira="rede_de_apoio",
            trecho="moro sozinha e esqueço, não tem quem me lembre", dias_atras=30)
    _caso(s, agora, caso_id="cas-07", paciente_id="pac-07", microarea_id="ma-01", status="busca_ativa",
          barreira="rede_de_apoio", rodada=2, dias_atras=30, desfecho="busca_ativa", recebeu=True)
    for numero, (item_id, dias) in enumerate([("mensagem_apoio_da_equipe", 28), ("visita_identificar_apoio", 14)], 1):
        _proposta(s, agora, proposta_id=f"pro-07-{numero}", caso_id="cas-07", relato_id="rlt-07",
                  item_id=item_id, paciente=pacientes["pac-07"], acs=agentes["acs-01"], estado="executada",
                  fontes=[FONTE_APOIO], horas_atras=dias * 24, decidida_por="prof-enfermeira",
                  justificativa="A paciente mora só e não tem quem apoie a rotina dos remédios.")
        s.add(banco.Execucao(
            id=f"exe-07-{numero}", proposta_id=f"pro-07-{numero}", ferramenta=item_por_id(item_id).ferramenta,
            chave_unica=f"pro-07-{numero}:{item_por_id(item_id).ferramenta}", resultado={"feito": True},
            criado_em=agora - timedelta(days=dias),
        ))
        s.add(banco.Resultado(
            id=f"res-07-{numero}", caso_id="cas-07", proposta_id=f"pro-07-{numero}", item_catalogo_id=item_id,
            barreira_resolvida=False, observacao="Paciente segue sem apoio em casa e com uso irregular.",
            registrado_por="acs-01", criado_em=agora - timedelta(days=dias - 6),
        ))
    s.add(banco.TarefaAcs(
        id="tar-07", paciente_id="pac-07", acs_id="acs-01", caso_id="cas-07", tipo="busca_ativa",
        descricao="Busca ativa presencial e levar o caso de Raimunda à reunião de equipe.",
        prazo=agora + timedelta(days=2), origem="manual", criado_em=agora - timedelta(days=8),
    ))

    # Caso suspenso: o aceite foi revogado e a proposta pendente foi cancelada.
    _relato(s, agora, relato_id="rlt-08", paciente_id="pac-08", barreira="muitos_medicamentos",
            trecho="não sei mais qual é o da manhã e qual é o da noite", dias_atras=3)
    _caso(s, agora, caso_id="cas-08", paciente_id="pac-08", microarea_id="ma-02", status="suspenso",
          barreira="muitos_medicamentos", dias_atras=3)
    _proposta(s, agora, proposta_id="pro-08", caso_id="cas-08", relato_id="rlt-08",
              item_id="mensagem_quadro_de_horarios", paciente=pacientes["pac-08"], acs=agentes["acs-02"],
              estado="cancelada", fontes=[FONTE_MUITOS], horas_atras=60,
              motivo="Aceite revogado pelo paciente.",
              justificativa="O paciente relata confusão entre os remédios da manhã e da noite.")

    # Uma proposta recusada, para o histórico da fila.
    _relato(s, agora, relato_id="rlt-09", paciente_id="pac-09", barreira="analfabetismo",
            trecho="as letrinhas da caixa eu não entendo", dias_atras=6)
    _caso(s, agora, caso_id="cas-09", paciente_id="pac-09", microarea_id="ma-03", status="aberto",
          barreira="analfabetismo", dias_atras=6)
    _proposta(s, agora, proposta_id="pro-09", caso_id="cas-09", relato_id="rlt-09",
              item_id="audio_explicar_receita", paciente=pacientes["pac-09"], acs=agentes["acs-03"],
              estado="recusada", fontes=[FONTE_LEITURA], horas_atras=120, decidida_por="prof-enfermeira",
              motivo="A paciente não usa o celular sozinha. Prefiro a visita da ACS.",
              justificativa="A paciente relata não entender as embalagens. O protocolo indica orientação falada.")
    s.add(banco.TarefaAcs(
        id="tar-09", paciente_id="pac-09", acs_id="acs-03", caso_id="cas-09", tipo="visita",
        descricao=_mensagem("visita_organizar_remedios", "Benedita Santos", "Tereza Nunes"),
        prazo=agora + timedelta(days=1), origem="manual", criado_em=agora - timedelta(days=5),
    ))

    s.commit()

    # Cada caso da carga registra um evento de origem, para o rastro nunca ficar vazio.
    for caso in s.exec(select(banco.Caso)).all():
        rastro.registrar_evento(
            s, etapa="C08", ator="regra", paciente_id=caso.paciente_id, caso_id=caso.id,
            entrada={"origem": "carga de dados sintéticos"},
            saida={"resumo": "Caso criado pela carga de dados sintéticos, já no estado mostrado.",
                   "status": caso.status, "rodada": caso.rodada},
        )
    return contagens(s)


def contagens(s: Session) -> dict:
    tabelas = {
        "microareas": banco.Microarea, "acs": banco.Acs, "pacientes": banco.Paciente,
        "aceites": banco.Aceite, "casos": banco.Caso, "propostas": banco.Proposta,
        "relatos": banco.Relato, "tarefas": banco.TarefaAcs, "relatorios": banco.Relatorio,
        "resultados": banco.Resultado, "eventos": banco.Evento,
    }
    return {nome: len(s.exec(select(tabela)).all()) for nome, tabela in tabelas.items()}


def main() -> int:
    with banco.sessao() as s:
        if "--se-vazio" in sys.argv and s.exec(select(banco.Paciente)).first() is not None:
            print("[pulse] banco já carregado")
            return 0
        totais = carregar(s)
    print("[pulse] dados sintéticos carregados:", ", ".join(f"{v} {k}" for k, v in totais.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
