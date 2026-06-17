"""Testes — FlowEngine, SessionManager e POST /api/whatsapp/webhook."""
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from engine.flow_engine import FlowEngine
from engine.session_manager import SessionManager


# ── Fixtures de nós/arestas ───────────────────────────────────────────────────

SIMPLE_NODES = [
    {"id": "start",  "data": {"kind": "trigger",  "label": "Início"}},
    {"id": "msg1",   "data": {"kind": "message",  "content": "Olá, {contact_name}!", "label": "Saudação"}},
    {"id": "q1",     "data": {"kind": "question", "content": "Qual é seu nome?", "variable": "nome", "label": "Pergunta"}},
    {"id": "end1",   "data": {"kind": "end",      "content": "Até logo!", "label": "Fim"}},
]

SIMPLE_EDGES = [
    {"id": "e1", "source": "start", "target": "msg1"},
    {"id": "e2", "source": "msg1",  "target": "q1"},
    {"id": "e3", "source": "q1",    "target": "end1"},
]

MENU_NODES = [
    {"id": "start",   "data": {"kind": "trigger", "label": "Início"}},
    {"id": "menu1",   "data": {"kind": "menu", "content": "Escolha:", "menuOptions": [{"label": "Criança"}, {"label": "Mãe"}], "label": "Menu"}},
    {"id": "sector1", "data": {"kind": "sector", "sectorName": "Financeiro", "institution": "crianca", "label": "Setor C"}},
    {"id": "sector2", "data": {"kind": "sector", "sectorName": "Financeiro", "institution": "mae",     "label": "Setor M"}},
]

MENU_EDGES = [
    {"id": "e1", "source": "start",  "target": "menu1"},
    {"id": "e2", "source": "menu1",  "target": "sector1", "label": "1"},
    {"id": "e3", "source": "menu1",  "target": "sector2", "label": "2"},
]

COND_NODES = [
    {"id": "start", "data": {"kind": "trigger",   "label": "Início"}},
    {"id": "cond1", "data": {"kind": "condition", "conditionField": "hora", "conditionValue": "ok", "label": "Cond"}},
    {"id": "msg_y", "data": {"kind": "message",   "content": "Dentro do horário", "label": "Sim"}},
    {"id": "msg_n", "data": {"kind": "message",   "content": "Fora do horário",   "label": "Não"}},
    {"id": "end1",  "data": {"kind": "end", "label": "Fim"}},
]

COND_EDGES = [
    {"id": "e1", "source": "start",  "target": "cond1"},
    {"id": "e2", "source": "cond1",  "target": "msg_y", "label": "Sim"},
    {"id": "e3", "source": "cond1",  "target": "msg_n", "label": "Não"},
    {"id": "e4", "source": "msg_y",  "target": "end1"},
    {"id": "e5", "source": "msg_n",  "target": "end1"},
]


# ── FlowEngine unit tests ─────────────────────────────────────────────────────

class TestFlowEngineStart:
    def test_encontra_no_start(self):
        engine = FlowEngine(SIMPLE_NODES, SIMPLE_EDGES)
        assert engine.get_start_node_id() == "start"

    def test_retorna_none_sem_start(self):
        engine = FlowEngine([{"id": "x", "data": {"kind": "message", "content": "hi", "label": "X"}}], [])
        assert engine.get_start_node_id() is None


class TestFlowEngineMessage:
    def test_mensagem_renderiza_variavel(self):
        engine = FlowEngine(SIMPLE_NODES, SIMPLE_EDGES)
        result = engine.process_message("start", "", {"contact_name": "João"}, False)
        assert "João" in result.messages[0]

    def test_para_em_question_e_aguarda(self):
        engine = FlowEngine(SIMPLE_NODES, SIMPLE_EDGES)
        result = engine.process_message("start", "", {}, False)
        assert result.waiting is True
        assert result.next_node_id == "q1"

    def test_question_salva_resposta_em_variavel(self):
        engine = FlowEngine(SIMPLE_NODES, SIMPLE_EDGES)
        r1 = engine.process_message("start", "", {}, False)
        r2 = engine.process_message(r1.next_node_id, "Maria", r1.variables, True)
        assert r2.variables.get("nome") == "Maria"

    def test_end_retorna_terminal_end(self):
        engine = FlowEngine(SIMPLE_NODES, SIMPLE_EDGES)
        r1 = engine.process_message("start", "", {}, False)
        r2 = engine.process_message(r1.next_node_id, "Maria", r1.variables, True)
        assert r2.terminal_action == "end"
        assert "Até logo!" in r2.messages


class TestFlowEngineMenu:
    def test_menu_envia_opcoes_formatadas(self):
        engine = FlowEngine(MENU_NODES, MENU_EDGES)
        result = engine.process_message("start", "", {}, False)
        assert result.waiting is True
        assert "Criança" in result.messages[-1]
        assert "Mãe" in result.messages[-1]

    def test_menu_opcao_valida_segue_aresta(self):
        engine = FlowEngine(MENU_NODES, MENU_EDGES)
        r1 = engine.process_message("start", "", {}, False)
        r2 = engine.process_message(r1.next_node_id, "2", r1.variables, True)
        assert r2.terminal_action == "sector"
        assert r2.institution == "mae"

    def test_menu_opcao_invalida_reexibe_menu(self):
        engine = FlowEngine(MENU_NODES, MENU_EDGES)
        r1 = engine.process_message("start", "", {}, False)
        r2 = engine.process_message(r1.next_node_id, "9", r1.variables, True)
        assert r2.waiting is True
        assert r2.next_node_id == r1.next_node_id

    def test_menu_sector_retorna_nome_correto(self):
        engine = FlowEngine(MENU_NODES, MENU_EDGES)
        r1 = engine.process_message("start", "", {}, False)
        r2 = engine.process_message(r1.next_node_id, "1", r1.variables, True)
        assert r2.terminal_action == "sector"
        assert r2.sector_name == "Financeiro"
        assert r2.institution == "crianca"


class TestFlowEngineCondition:
    def test_condition_true_segue_sim(self):
        engine = FlowEngine(COND_NODES, COND_EDGES)
        result = engine.process_message("start", "", {"hora": "ok"}, False)
        assert "Dentro do horário" in result.messages

    def test_condition_false_segue_nao(self):
        engine = FlowEngine(COND_NODES, COND_EDGES)
        result = engine.process_message("start", "", {"hora": "errado"}, False)
        assert "Fora do horário" in result.messages


# ── SessionManager unit tests ─────────────────────────────────────────────────

class TestSessionManager:
    def setup_method(self):
        self.sm = SessionManager()

    def test_cria_sessao(self):
        s = self.sm.create("user1", "node-start")
        assert s.current_node_id == "node-start"
        assert s.waiting_for_input is False

    def test_get_retorna_sessao_existente(self):
        self.sm.create("user1", "node-a")
        s = self.sm.get("user1")
        assert s is not None
        assert s.current_node_id == "node-a"

    def test_get_retorna_none_para_desconhecido(self):
        assert self.sm.get("ninguem") is None

    def test_update_atualiza_campos(self):
        self.sm.create("user1", "node-a")
        self.sm.update("user1", current_node_id="node-b", waiting_for_input=True)
        s = self.sm.get("user1")
        assert s.current_node_id == "node-b"
        assert s.waiting_for_input is True

    def test_destroy_remove_sessao(self):
        self.sm.create("user1", "node-a")
        self.sm.destroy("user1")
        assert self.sm.get("user1") is None

    def test_destroy_nao_erro_para_inexistente(self):
        self.sm.destroy("fantasma")


# ── Helpers de payload ────────────────────────────────────────────────────────

def _mk_payload(text="Olá", from_me=False, event="messages.upsert",
                jid="5511987654321@s.whatsapp.net"):
    return {
        "event": event,
        "instance": "test",
        "data": {
            "key": {"remoteJid": jid, "fromMe": from_me, "id": "MSG001"},
            "pushName": "Teste",
            "message": {"conversation": text},
            "messageType": "conversation",
        },
    }


_FULL_HOURS_SETTINGS = {
    "bot_enabled": True,
    "business_hours_start": "00:00",
    "business_hours_end": "23:59",
    "business_days": "0,1,2,3,4,5,6",
    "org_name": "Batuira",
    "bot_fallback_phone": "",
    "off_hours_message": "",
    "conversation_timeout_hours": 24,
}


# ── Webhook — eventos ignorados (sem DB) ──────────────────────────────────────

class TestWebhookIgnorados:
    def test_ignora_evento_diferente(self, client):
        resp = client.post("/api/whatsapp/webhook", json=_mk_payload(event="connection.update"))
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_ignora_mensagem_propria(self, client):
        resp = client.post("/api/whatsapp/webhook", json=_mk_payload(from_me=True))
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_ignora_mensagem_de_grupo(self, client):
        resp = client.post("/api/whatsapp/webhook", json=_mk_payload(jid="123@g.us"))
        assert resp.status_code == 200
        assert resp.json()["ignored"] is True

    def test_ignora_bot_desativado(self, client):
        with patch("api.routes.get_settings",
                   return_value={**_FULL_HOURS_SETTINGS, "bot_enabled": False}):
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload())
        assert resp.json()["ignored"] is True


# ── Webhook — fluxo de conversa com DB ───────────────────────────────────────

class TestWebhookFluxo:
    """Testa o fluxo institution→menu→sector com o DB real (temporário)."""

    def test_nova_mensagem_envia_menu_instituicao(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}):
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "institution_menu_sent"

    def test_keyword_reset_reenvia_menu_instituicao(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}):
            # Cria conversa e depois reseta
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload(text="0"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "institution_menu_sent"

    def test_escolha_instituicao_valida_envia_menu_setores(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_menu", return_value={"success": True}):
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload(text="1"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "menu_sent"

    def test_escolha_instituicao_invalida(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_invalid_institution", return_value={"success": True}):
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload(text="X"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "invalid_institution"

    def test_escolha_setor_valido_atribui_setor(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_sector_confirmation", return_value={"success": True}), \
             patch("api.routes.wa.send_queue_position", return_value={"success": True}), \
             patch("api.routes._notify_sector_attendants"):
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="1"))
            resp = client.post("/api/whatsapp/webhook", json=_mk_payload(text="1"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "sector_assigned"

    def test_mensagem_em_conversa_waiting_e_armazenada(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_menu", return_value={"success": True}), \
             patch("api.routes.wa.send_sector_confirmation", return_value={"success": True}), \
             patch("api.routes.wa.send_queue_position", return_value={"success": True}), \
             patch("api.routes._notify_sector_attendants"):
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="oi"))
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="1"))
            client.post("/api/whatsapp/webhook", json=_mk_payload(text="1"))
            # Conversa agora em "waiting"
            resp = client.post("/api/whatsapp/webhook",
                               json=_mk_payload(text="Quando posso pagar?"))

        assert resp.status_code == 200
        assert resp.json()["action"] == "message_stored"

    def test_keyword_menu_reinicia_fluxo(self, client):
        with patch("api.routes.get_settings", return_value=_FULL_HOURS_SETTINGS), \
             patch("api.routes.wa.send_institution_menu", return_value={"success": True}):
            for keyword in ("menu", "inicio", "voltar"):
                resp = client.post("/api/whatsapp/webhook",
                                   json=_mk_payload(text=keyword))
                assert resp.json()["action"] == "institution_menu_sent"
