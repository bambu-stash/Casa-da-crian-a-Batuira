"""TDD – utils/settings_store.py"""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from utils.settings_store import get_settings, update_settings, _ALLOWED_KEYS


class TestGetSettings:
    def test_retorna_defaults_do_env_sem_override(self, tmp_path):
        with patch("utils.settings_store._OVERRIDE_FILE", tmp_path / "nao_existe.json"), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "Hotel Env"
            mock_env.hotel_checkin_time = "15:00"
            mock_env.hotel_checkout_time = "12:00"

            result = get_settings()

        assert result["hotel_name"] == "Hotel Env"
        assert result["hotel_checkin_time"] == "15:00"
        assert result["bot_enabled"] is True
        assert result["bot_fallback_phone"] == ""

    def test_override_sobreescreve_env(self, tmp_path):
        override_file = tmp_path / "settings_override.json"
        override_file.write_text(json.dumps({"hotel_name": "Override Name", "bot_enabled": False}))

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "Hotel Env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            result = get_settings()

        assert result["hotel_name"] == "Override Name"
        assert result["bot_enabled"] is False
        assert result["hotel_checkin_time"] == "14:00"  # env preservado

    def test_json_invalido_usa_env(self, tmp_path):
        override_file = tmp_path / "settings_override.json"
        override_file.write_text("{ invalido }")

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "Fallback"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            result = get_settings()

        assert result["hotel_name"] == "Fallback"


class TestUpdateSettings:
    def test_salva_nova_configuracao(self, tmp_path):
        override_file = tmp_path / "settings_override.json"

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "Original"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            update_settings({"hotel_name": "Novo Nome"})

        saved = json.loads(override_file.read_text())
        assert saved["hotel_name"] == "Novo Nome"

    def test_merge_com_configuracoes_existentes(self, tmp_path):
        override_file = tmp_path / "settings_override.json"
        override_file.write_text(json.dumps({"hotel_name": "A", "bot_enabled": False}))

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            update_settings({"hotel_checkin_time": "16:00"})

        saved = json.loads(override_file.read_text())
        assert saved["hotel_name"] == "A"
        assert saved["bot_enabled"] is False
        assert saved["hotel_checkin_time"] == "16:00"

    def test_ignora_chaves_nao_permitidas(self, tmp_path):
        """Campos internos do sistema (sheets_id, etc.) nunca devem ser salvos via API."""
        override_file = tmp_path / "settings_override.json"

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            update_settings({"sheets_id": "hack", "gmail_monitored_email": "hack@evil.com", "hotel_name": "Válido"})

        saved = json.loads(override_file.read_text())
        assert "sheets_id" not in saved
        assert "gmail_monitored_email" not in saved
        assert saved["hotel_name"] == "Válido"

    def test_salva_api_key_quando_permitida(self, tmp_path):
        override_file = tmp_path / "settings_override.json"

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"
            mock_env.anthropic_api_key = ""
            mock_env.evolution_api_key = ""
            mock_env.evolution_api_url = ""
            mock_env.evolution_instance = ""

            update_settings({"anthropic_api_key": "sk-ant-real-key"})

        saved = json.loads(override_file.read_text())
        assert saved["anthropic_api_key"] == "sk-ant-real-key"

    def test_get_settings_mascara_chaves_sensiveis(self, tmp_path):
        override_file = tmp_path / "settings_override.json"
        override_file.write_text(json.dumps({"anthropic_api_key": "sk-ant-abcd1234"}))

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"
            mock_env.anthropic_api_key = ""
            mock_env.evolution_api_key = ""
            mock_env.evolution_api_url = ""
            mock_env.evolution_instance = ""

            result = get_settings()

        assert result["anthropic_api_key"] == "****1234"
        assert "sk-ant" not in result["anthropic_api_key"]

    def test_cria_diretorio_se_nao_existir(self, tmp_path):
        override_file = tmp_path / "subdir" / "settings_override.json"

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            update_settings({"bot_enabled": True})

        assert override_file.exists()

    def test_retorna_settings_atualizado(self, tmp_path):
        override_file = tmp_path / "settings_override.json"

        with patch("utils.settings_store._OVERRIDE_FILE", override_file), \
             patch("utils.settings_store._env") as mock_env:
            mock_env.hotel_name = "env"
            mock_env.hotel_checkin_time = "14:00"
            mock_env.hotel_checkout_time = "11:00"

            result = update_settings({"bot_fallback_phone": "11999990000"})

        assert result["bot_fallback_phone"] == "11999990000"
