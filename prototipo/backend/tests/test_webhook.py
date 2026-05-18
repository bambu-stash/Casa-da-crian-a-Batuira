"""TDD – POST /api/whatsapp/webhook"""
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _payload(
    event="messages.upsert",
    from_me=False,
    jid="5511987654321@s.whatsapp.net",
    text="Qual é o wifi?",
    push_name="João",
):
    return {
        "event": event,
        "instance": "hostmaster",
        "data": {
            "key": {"remoteJid": jid, "fromMe": from_me, "id": "MSG001"},
            "pushName": push_name,
            "message": {"conversation": text},
            "messageType": "conversation",
        },
    }


class TestWebhook:
    def test_responde_mensagem_comum(self):
        with patch("api.routes.generate_response", return_value="O Wi-Fi é Hotel123."), \
             patch("api.routes.wa.send_welcome", return_value={"success": True}), \
             patch("api.routes.get_settings", return_value={"bot_enabled": True, "bot_fallback_phone": ""}):
            resp = client.post("/api/whatsapp/webhook", json=_payload())

        assert resp.status_code == 200
        assert resp.json()["replied"] is True

    def test_ignora_mensagem_enviada_pelo_bot(self):
        with patch("api.routes.generate_response") as mock_ai:
            resp = client.post("/api/whatsapp/webhook", json=_payload(from_me=True))

        assert resp.status_code == 200
        assert resp.json().get("ignored") is True
        mock_ai.assert_not_called()

    def test_ignora_evento_diferente_de_mensagem(self):
        with patch("api.routes.generate_response") as mock_ai:
            resp = client.post("/api/whatsapp/webhook", json=_payload(event="connection.update"))

        assert resp.status_code == 200
        assert resp.json().get("ignored") is True
        mock_ai.assert_not_called()

    def test_ignora_quando_bot_desabilitado(self):
        with patch("api.routes.generate_response") as mock_ai, \
             patch("api.routes.get_settings", return_value={"bot_enabled": False, "bot_fallback_phone": ""}):
            resp = client.post("/api/whatsapp/webhook", json=_payload())

        assert resp.status_code == 200
        assert resp.json().get("ignored") is True
        mock_ai.assert_not_called()

    def test_escala_para_humano_quando_ai_retorna_none(self):
        with patch("api.routes.generate_response", return_value=None), \
             patch("api.routes.wa.send_fallback_alert", return_value={"success": True}) as mock_fb, \
             patch("api.routes.get_settings", return_value={"bot_enabled": True, "bot_fallback_phone": "11999990000"}):
            resp = client.post("/api/whatsapp/webhook", json=_payload())

        assert resp.status_code == 200
        assert resp.json()["replied"] is False
        assert resp.json()["escalated"] is True
        mock_fb.assert_called_once()

    def test_nao_escala_sem_fallback_phone(self):
        with patch("api.routes.generate_response", return_value=None), \
             patch("api.routes.wa.send_fallback_alert") as mock_fb, \
             patch("api.routes.get_settings", return_value={"bot_enabled": True, "bot_fallback_phone": ""}), \
             patch("api.routes.settings") as mock_s:
            mock_s.bot_fallback_phone = ""
            resp = client.post("/api/whatsapp/webhook", json=_payload())

        assert resp.status_code == 200
        assert resp.json()["escalated"] is False
        mock_fb.assert_not_called()

    def test_ignora_mensagem_sem_texto(self):
        p = _payload()
        p["data"]["message"] = None

        with patch("api.routes.generate_response") as mock_ai:
            resp = client.post("/api/whatsapp/webhook", json=p)

        assert resp.status_code == 200
        assert resp.json().get("ignored") is True
        mock_ai.assert_not_called()

    def test_extrai_numero_do_jid(self):
        captured = {}

        def fake_send(phone_raw, **kwargs):
            captured["phone"] = phone_raw
            return {"success": True}

        with patch("api.routes.generate_response", return_value="Olá!"), \
             patch("api.routes.wa.send_welcome", side_effect=fake_send), \
             patch("api.routes.get_settings", return_value={"bot_enabled": True, "bot_fallback_phone": ""}):
            client.post("/api/whatsapp/webhook", json=_payload(jid="5521998887766@s.whatsapp.net"))

        assert captured["phone"] == "5521998887766"


class TestSettingsEndpoints:
    def test_get_settings_retorna_dados(self):
        with patch("api.routes.get_settings", return_value={
            "hotel_name": "Test Hotel", "bot_enabled": True,
            "hotel_checkin_time": "14:00", "hotel_checkout_time": "11:00",
            "bot_fallback_phone": "",
        }):
            resp = client.get("/api/settings")

        assert resp.status_code == 200
        data = resp.json()
        assert data["hotel_name"] == "Test Hotel"
        assert "bot_enabled" in data

    def test_patch_settings_atualiza_e_retorna(self):
        updated = {
            "hotel_name": "Novo Hotel", "bot_enabled": False,
            "hotel_checkin_time": "15:00", "hotel_checkout_time": "10:00",
            "bot_fallback_phone": "11988880000",
        }
        with patch("api.routes.update_settings", return_value=updated) as mock_update:
            resp = client.patch("/api/settings", json={"hotel_name": "Novo Hotel", "bot_enabled": False})

        assert resp.status_code == 200
        mock_update.assert_called_once()
        assert resp.json()["hotel_name"] == "Novo Hotel"

    def test_patch_settings_ignora_campos_none(self):
        updated = {"hotel_name": "X", "bot_enabled": True,
                   "hotel_checkin_time": "14:00", "hotel_checkout_time": "11:00",
                   "bot_fallback_phone": ""}
        with patch("api.routes.update_settings", return_value=updated) as mock_update:
            client.patch("/api/settings", json={"hotel_name": "X"})

        call_arg = mock_update.call_args[0][0]
        assert "bot_enabled" not in call_arg
        assert call_arg == {"hotel_name": "X"}
