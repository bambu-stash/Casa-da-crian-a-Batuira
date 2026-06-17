"""Testes — agents/whatsapp_agent.py"""
from unittest.mock import MagicMock, patch

import httpx
import pytest

from agents.whatsapp_agent import WhatsAppAgent


@pytest.fixture
def agent():
    return WhatsAppAgent()


class TestSendText:
    def test_envia_texto_com_sucesso(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"id": "abc"}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            result = agent.send_text("11987654321", "Olá!")

        assert result["success"] is True
        assert result["data"] == {"id": "abc"}
        mock_post.assert_called_once()

    def test_numero_invalido_retorna_erro_sem_chamada_http(self, agent):
        with patch("agents.whatsapp_agent.httpx.post") as mock_post:
            result = agent.send_text("xxx", "Olá!")

        assert result["success"] is False
        assert "inválido" in result["error"]
        mock_post.assert_not_called()

    def test_erro_http_retorna_falha(self, agent):
        with patch("agents.whatsapp_agent.httpx.post", side_effect=httpx.HTTPError("timeout")):
            result = agent.send_text("11987654321", "Olá!")

        assert result["success"] is False
        assert "timeout" in result["error"]

    def test_payload_contem_numero_e_texto(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_text("11987654321", "Mensagem teste")

        _, kwargs = mock_post.call_args
        assert kwargs["json"]["text"] == "Mensagem teste"
        assert "5511987654321" in kwargs["json"]["number"]


class TestSendInstitutionMenu:
    def test_menu_contem_nome_do_contato(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_institution_menu("11987654321", "Maria")

        _, kwargs = mock_post.call_args
        assert "Maria" in kwargs["json"]["text"]

    def test_menu_contem_opcoes_numeradas(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_institution_menu("11987654321", "")

        _, kwargs = mock_post.call_args
        text = kwargs["json"]["text"]
        assert "1" in text
        assert "2" in text


class TestSendSectorConfirmation:
    def test_confirmacao_contem_nome_do_setor(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            agent.send_sector_confirmation("11987654321", "Financeiro")

        _, kwargs = mock_post.call_args
        assert "Financeiro" in kwargs["json"]["text"]


class TestSendAttendantNotification:
    def test_notificacao_contem_dados_do_contato(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            result = agent.send_attendant_notification(
                "11999990000", "João Silva", "5511987654321", "Financeiro"
            )

        assert result["success"] is True
        _, kwargs = mock_post.call_args
        text = kwargs["json"]["text"]
        assert "João Silva" in text
        assert "Financeiro" in text

    def test_numero_invalido_retorna_erro(self, agent):
        with patch("agents.whatsapp_agent.httpx.post") as mock_post:
            result = agent.send_attendant_notification("abc", "João", "5511987654321", "TI")

        assert result["success"] is False
        mock_post.assert_not_called()


class TestSendCloseConfirmation:
    def test_mensagem_de_encerramento_enviada(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            result = agent.send_close_confirmation("11987654321")

        assert result["success"] is True
        _, kwargs = mock_post.call_args
        assert "encerrado" in kwargs["json"]["text"].lower() or "concluído" in kwargs["json"]["text"].lower()


class TestSendTransferNotification:
    def test_notificacao_contem_nome_do_setor_destino(self, agent):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {}
        mock_resp.raise_for_status = MagicMock()

        with patch("agents.whatsapp_agent.httpx.post", return_value=mock_resp) as mock_post:
            result = agent.send_transfer_notification("11987654321", "Pedagógico")

        assert result["success"] is True
        _, kwargs = mock_post.call_args
        assert "Pedagógico" in kwargs["json"]["text"]
