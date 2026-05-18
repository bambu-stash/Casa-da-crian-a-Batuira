"""TDD – utils/phone.py"""
import pytest
from utils.phone import sanitize_whatsapp_number


class TestSanitizeWhatsappNumber:
    def test_numero_brasileiro_com_ddd(self):
        result = sanitize_whatsapp_number("11987654321")
        assert result == "5511987654321"

    def test_numero_com_codigo_pais(self):
        result = sanitize_whatsapp_number("+5511987654321")
        assert result == "5511987654321"

    def test_numero_com_formatacao(self):
        result = sanitize_whatsapp_number("(11) 98765-4321")
        assert result == "5511987654321"

    def test_numero_invalido_retorna_none(self):
        assert sanitize_whatsapp_number("123") is None

    def test_string_vazia_retorna_none(self):
        assert sanitize_whatsapp_number("") is None

    def test_texto_nao_numerico_retorna_none(self):
        assert sanitize_whatsapp_number("nenhum") is None

    def test_numero_fixo_valido(self):
        result = sanitize_whatsapp_number("1133334444")
        assert result == "551133334444"

    def test_sem_prefixo_plus(self):
        """Resultado nunca deve conter '+'."""
        result = sanitize_whatsapp_number("+5521987654321")
        assert result is not None
        assert not result.startswith("+")
