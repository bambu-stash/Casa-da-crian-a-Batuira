"""TDD – agents/chat_agent.py"""
from unittest.mock import MagicMock, patch

import pytest

from agents.chat_agent import generate_response


def _mock_claude(text: str):
    content = MagicMock()
    content.text = text
    resp = MagicMock()
    resp.content = [content]
    return resp


class TestGenerateResponse:
    def test_retorna_texto_quando_claude_responde(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a:
            mock_a.return_value.messages.create.return_value = _mock_claude("O Wi-Fi é Hotel123.")
            result = generate_response("Qual a senha do wifi?")

        assert result == "O Wi-Fi é Hotel123."

    def test_retorna_none_quando_claude_escala(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a:
            mock_a.return_value.messages.create.return_value = _mock_claude("ESCALAR_HUMANO")
            result = generate_response("Preciso de ambulância!")

        assert result is None

    def test_retorna_none_quando_escalar_humano_esta_no_meio_do_texto(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a:
            mock_a.return_value.messages.create.return_value = _mock_claude(
                "Não sei responder. ESCALAR_HUMANO"
            )
            result = generate_response("Algo complexo")

        assert result is None

    def test_prompt_contem_nome_do_hotel(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a, \
             patch("agents.chat_agent.settings") as mock_s:
            mock_s.hotel_name = "Grand Palace"
            mock_s.hotel_checkin_time = "14:00"
            mock_s.hotel_checkout_time = "11:00"
            mock_s.anthropic_api_key = "test"
            mock_a.return_value.messages.create.return_value = _mock_claude("Olá!")

            generate_response("Oi")

            call_kwargs = mock_a.return_value.messages.create.call_args[1]
            assert "Grand Palace" in call_kwargs["system"]

    def test_usa_modelo_haiku(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a:
            mock_a.return_value.messages.create.return_value = _mock_claude("Resp")
            generate_response("msg")

            call_kwargs = mock_a.return_value.messages.create.call_args[1]
            assert "haiku" in call_kwargs["model"]

    def test_resposta_nao_contem_escalar_humano_no_resultado(self):
        with patch("agents.chat_agent.anthropic.Anthropic") as mock_a:
            mock_a.return_value.messages.create.return_value = _mock_claude(
                "O check-in é às 14h."
            )
            result = generate_response("Que horas é o check-in?")

        assert result is not None
        assert "ESCALAR_HUMANO" not in result
