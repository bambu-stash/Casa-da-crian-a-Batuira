"""TDD – agents/whatsapp_agent.py"""
from unittest.mock import MagicMock, patch

import httpx
import pytest

from agents.whatsapp_agent import WhatsAppAgent, WELCOME_TEMPLATE


@pytest.fixture
def agent():
    return WhatsAppAgent()


class TestSendWelcome:
    def test_envia_mensagem_com_sucesso(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"id": "abc"}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            result = agent.send_welcome(
                phone_raw="11987654321",
                guest_name="João",
                checkin="2026-05-01",
                checkout="2026-05-05",
            )

        assert result["success"] is True
        assert result["data"] == {"id": "abc"}
        mock_post.assert_called_once()

    def test_numero_invalido_retorna_erro_sem_chamada_http(self, agent):
        with patch("agents.whatsapp_agent.httpx.post") as mock_post:
            result = agent.send_welcome(
                phone_raw="xxx",
                guest_name="João",
                checkin="2026-05-01",
                checkout="2026-05-05",
            )

        assert result["success"] is False
        assert "inválido" in result["error"]
        mock_post.assert_not_called()

    def test_mensagem_customizada_substitui_template(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_welcome(
                phone_raw="11987654321",
                guest_name="Ana",
                checkin="2026-05-01",
                checkout="2026-05-05",
                custom_message="Mensagem especial",
            )

        _, kwargs = mock_post.call_args
        assert kwargs["json"]["text"] == "Mensagem especial"

    def test_template_padrao_contem_nome_e_datas(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_welcome(
                phone_raw="11987654321",
                guest_name="Maria",
                checkin="2026-05-01",
                checkout="2026-05-05",
            )

        _, kwargs = mock_post.call_args
        text = kwargs["json"]["text"]
        assert "Maria" in text
        assert "2026-05-01" in text
        assert "2026-05-05" in text

    def test_erro_http_retorna_falha(self, agent):
        with patch("agents.whatsapp_agent.httpx.post", side_effect=httpx.HTTPError("timeout")):
            result = agent.send_welcome(
                phone_raw="11987654321",
                guest_name="Carlos",
                checkin="2026-05-01",
                checkout="2026-05-05",
            )

        assert result["success"] is False
        assert "timeout" in result["error"]


class TestSendFallbackAlert:
    def test_envia_alerta_com_sucesso(self, agent):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp):
            result = agent.send_fallback_alert(
                phone_raw="11999990000",
                original_message="Qual o wifi?",
            )

        assert result["success"] is True

    def test_numero_invalido_retorna_erro(self, agent):
        with patch("agents.whatsapp_agent.httpx.post") as mock_post:
            result = agent.send_fallback_alert(phone_raw="abc", original_message="msg")

        assert result["success"] is False
        mock_post.assert_not_called()

    def test_alerta_contem_intervencao(self, agent):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_fallback_alert(
                phone_raw="11999990000",
                original_message="mensagem teste",
            )

        _, kwargs = mock_post.call_args
        assert "INTERVENÇÃO" in kwargs["json"]["text"]
