"""TDD – agents/gmail_agent.py"""
import base64
import json
from unittest.mock import MagicMock, patch

import pytest

from agents.gmail_agent import (
    _extract_email_body,
    _parse_reservation_with_ai,
    fetch_new_reservations,
    Reservation,
)


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode()


class TestExtractEmailBody:
    def test_extrai_corpo_sem_partes(self):
        msg = {"payload": {"body": {"data": _b64("Corpo simples")}, "parts": []}}
        assert _extract_email_body(msg) == "Corpo simples"

    def test_extrai_texto_plano_de_partes(self):
        msg = {
            "payload": {
                "parts": [
                    {"mimeType": "text/html", "body": {"data": _b64("<html>ignorado</html>")}},
                    {"mimeType": "text/plain", "body": {"data": _b64("Texto real")}},
                ]
            }
        }
        assert _extract_email_body(msg) == "Texto real"

    def test_retorna_vazio_sem_dados(self):
        msg = {"payload": {"body": {}, "parts": []}}
        assert _extract_email_body(msg) == ""

    def test_retorna_vazio_sem_text_plain_nas_partes(self):
        msg = {
            "payload": {
                "parts": [
                    {"mimeType": "text/html", "body": {"data": _b64("<html/>")}},
                ]
            }
        }
        assert _extract_email_body(msg) == ""

    def test_prioriza_text_plain_sobre_html(self):
        msg = {
            "payload": {
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": _b64("plain")}},
                    {"mimeType": "text/html", "body": {"data": _b64("<html>html</html>")}},
                ]
            }
        }
        assert _extract_email_body(msg) == "plain"


class TestParseReservationWithAI:
    def _make_mock_response(self, json_data: dict):
        mock_content = MagicMock()
        mock_content.text = json.dumps(json_data)
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]
        return mock_resp

    def test_parseia_reserva_valida(self):
        expected = {
            "guest_name": "João Silva",
            "guest_email": "joao@email.com",
            "guest_phone": "11987654321",
            "checkin": "2026-05-01",
            "checkout": "2026-05-05",
            "room": "101",
            "booking_id": "BK123",
            "is_cancellation": False,
        }
        mock_resp = self._make_mock_response(expected)

        with patch("agents.gmail_agent.anthropic.Anthropic") as mock_anthropic:
            mock_anthropic.return_value.messages.create.return_value = mock_resp
            result = _parse_reservation_with_ai("email body", "noreply@booking.com")

        assert result["guest_name"] == "João Silva"
        assert result["is_cancellation"] is False

    def test_retorna_vazio_se_ai_retorna_texto_invalido(self):
        mock_content = MagicMock()
        mock_content.text = "sem json aqui"
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]

        with patch("agents.gmail_agent.anthropic.Anthropic") as mock_anthropic:
            mock_anthropic.return_value.messages.create.return_value = mock_resp
            result = _parse_reservation_with_ai("email body", "noreply@booking.com")

        assert result == {}

    def test_extrai_json_de_texto_com_ruido(self):
        """AI pode retornar texto antes/depois do JSON."""
        json_data = {"guest_name": "Ana", "guest_email": "", "guest_phone": "",
                     "checkin": "2026-06-01", "checkout": "2026-06-03",
                     "room": "", "booking_id": "AK999", "is_cancellation": False}
        mock_content = MagicMock()
        mock_content.text = f"Aqui está o resultado:\n{json.dumps(json_data)}\nEspero que ajude."
        mock_resp = MagicMock()
        mock_resp.content = [mock_content]

        with patch("agents.gmail_agent.anthropic.Anthropic") as mock_anthropic:
            mock_anthropic.return_value.messages.create.return_value = mock_resp
            result = _parse_reservation_with_ai("email body", "noreply@airbnb.com")

        assert result["guest_name"] == "Ana"
        assert result["booking_id"] == "AK999"


class TestFetchNewReservations:
    def test_retorna_lista_vazia_sem_emails(self):
        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {"messages": []}

        with patch("agents.gmail_agent._get_gmail_service", return_value=mock_service):
            result = fetch_new_reservations()

        assert result == []

    def test_retorna_reservation_valida(self):
        email_body = "Reserva confirmada para João Silva"
        encoded = base64.urlsafe_b64encode(email_body.encode()).decode()

        msg = {
            "id": "msg1",
            "payload": {
                "headers": [{"name": "From", "value": "noreply@booking.com"}],
                "body": {"data": encoded},
                "parts": [],
            },
        }

        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {"messages": [{"id": "msg1"}]}
        mock_service.users().messages().get().execute.return_value = msg
        mock_service.users().messages().modify().execute.return_value = {}

        ai_data = {
            "guest_name": "João Silva",
            "guest_email": "j@b.com",
            "guest_phone": "11987654321",
            "checkin": "2026-05-01",
            "checkout": "2026-05-03",
            "room": "201",
            "booking_id": "BK001",
            "is_cancellation": False,
        }

        with patch("agents.gmail_agent._get_gmail_service", return_value=mock_service), \
             patch("agents.gmail_agent._parse_reservation_with_ai", return_value=ai_data):
            result = fetch_new_reservations()

        assert len(result) == 1
        assert isinstance(result[0], Reservation)
        assert result[0].guest_name == "João Silva"
        assert result[0].platform == "booking"

    def test_marca_email_como_lido_apos_processar(self):
        email_body = "Reserva"
        encoded = base64.urlsafe_b64encode(email_body.encode()).decode()
        msg = {
            "id": "msg99",
            "payload": {
                "headers": [{"name": "From", "value": "noreply@airbnb.com"}],
                "body": {"data": encoded},
                "parts": [],
            },
        }

        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {"messages": [{"id": "msg99"}]}
        mock_service.users().messages().get().execute.return_value = msg
        mock_service.users().messages().modify().execute.return_value = {}

        with patch("agents.gmail_agent._get_gmail_service", return_value=mock_service), \
             patch("agents.gmail_agent._parse_reservation_with_ai", return_value={}):
            fetch_new_reservations()

        mock_service.users().messages().modify.assert_called()

    def test_plataforma_airbnb_detectada(self):
        email_body = "Reserva Airbnb"
        encoded = base64.urlsafe_b64encode(email_body.encode()).decode()
        msg = {
            "id": "a1",
            "payload": {
                "headers": [{"name": "From", "value": "noreply@airbnb.com"}],
                "body": {"data": encoded},
                "parts": [],
            },
        }
        ai_data = {
            "guest_name": "Pedro", "guest_email": "", "guest_phone": "11987654321",
            "checkin": "2026-07-01", "checkout": "2026-07-05",
            "room": "10", "booking_id": "AB001", "is_cancellation": False,
        }

        mock_service = MagicMock()
        mock_service.users().messages().list().execute.return_value = {"messages": [{"id": "a1"}]}
        mock_service.users().messages().get().execute.return_value = msg
        mock_service.users().messages().modify().execute.return_value = {}

        with patch("agents.gmail_agent._get_gmail_service", return_value=mock_service), \
             patch("agents.gmail_agent._parse_reservation_with_ai", return_value=ai_data):
            result = fetch_new_reservations()

        assert result[0].platform == "airbnb"
