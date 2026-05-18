"""TDD – api/routes.py (FastAPI endpoints)"""
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_retorna_status_ok(self):
        with patch("api.routes.Path.exists", return_value=False):
            resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_google_configurado_quando_token_existe(self, tmp_path):
        token = tmp_path / "token.json"
        token.write_text("{}")

        with patch("api.routes.settings") as mock_s, \
             patch("api.routes.Path") as mock_path:
            mock_s.google_token_file = str(token)
            mock_s.evolution_api_key = "key"
            mock_s.anthropic_api_key = "key"
            mock_path.return_value.exists.return_value = True

            resp = client.get("/api/health")

        assert resp.status_code == 200

    def test_servicos_presentes_na_resposta(self):
        resp = client.get("/api/health")
        data = resp.json()
        assert "services" in data
        services = data["services"]
        assert "google_oauth" in services
        assert "evolution_api" in services
        assert "anthropic" in services


class TestGmailSyncEndpoint:
    def test_retorna_syncing_quando_token_existe(self, tmp_path):
        token = tmp_path / "google_token.json"
        token.write_text("{}")

        # BackgroundTask executa no mesmo thread com TestClient — mockar _process_reservations
        with patch("api.routes.Path") as mock_path, \
             patch("api.routes._process_reservations"):
            mock_path.return_value.exists.return_value = True
            resp = client.post("/api/gmail/sync")

        assert resp.status_code == 200
        assert resp.json()["status"] == "syncing"

    def test_retorna_503_sem_token_google(self):
        with patch("api.routes.Path") as mock_path:
            mock_path.return_value.exists.return_value = False
            resp = client.post("/api/gmail/sync")

        assert resp.status_code == 503


class TestWhatsappWelcomeEndpoint:
    def test_envia_boas_vindas_com_sucesso(self):
        mock_result = {"success": True, "data": {"id": "123"}}
        with patch("api.routes.wa.send_welcome", return_value=mock_result):
            resp = client.post("/api/whatsapp/welcome", json={
                "phone": "11987654321",
                "guest_name": "João",
                "checkin": "2026-06-01",
                "checkout": "2026-06-05",
            })

        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_retorna_400_quando_numero_invalido(self):
        mock_result = {"success": False, "error": "Número inválido: xxx"}
        with patch("api.routes.wa.send_welcome", return_value=mock_result):
            resp = client.post("/api/whatsapp/welcome", json={
                "phone": "xxx",
                "guest_name": "João",
                "checkin": "2026-06-01",
                "checkout": "2026-06-05",
            })

        assert resp.status_code == 400

    def test_payload_sem_campo_obrigatorio_retorna_422(self):
        resp = client.post("/api/whatsapp/welcome", json={"phone": "11999999999"})
        assert resp.status_code == 422


class TestWhatsappFallbackEndpoint:
    def test_envia_fallback_com_sucesso(self):
        mock_result = {"success": True}
        with patch("api.routes.wa.send_fallback_alert", return_value=mock_result):
            resp = client.post("/api/whatsapp/fallback", json={
                "receptionist_phone": "11999990000",
                "guest_phone": "11888880000",
                "original_message": "Qual o wifi?",
            })

        assert resp.status_code == 200

    def test_retorna_400_quando_agente_falha(self):
        mock_result = {"success": False, "error": "Número inválido"}
        with patch("api.routes.wa.send_fallback_alert", return_value=mock_result):
            resp = client.post("/api/whatsapp/fallback", json={
                "receptionist_phone": "xxx",
                "guest_phone": "11888880000",
                "original_message": "msg",
            })

        assert resp.status_code == 400


class TestOccupancyEndpoint:
    def test_retorna_reservas_sem_data(self):
        mock_data = [{"ID Reserva": "BK001", "Hóspede": "João"}]
        with patch("api.routes.Path") as mock_path, \
             patch("api.routes.get_occupancy", return_value=mock_data):
            mock_path.return_value.exists.return_value = True
            resp = client.get("/api/occupancy")

        assert resp.status_code == 200
        assert len(resp.json()["reservations"]) == 1

    def test_retorna_aviso_sem_token_google(self):
        with patch("api.routes.Path") as mock_path:
            mock_path.return_value.exists.return_value = False
            resp = client.get("/api/occupancy")

        assert resp.status_code == 200
        assert "warning" in resp.json()

    def test_aceita_parametro_de_data(self):
        with patch("api.routes.Path") as mock_path, \
             patch("api.routes.get_occupancy", return_value=[]) as mock_occ:
            mock_path.return_value.exists.return_value = True
            client.get("/api/occupancy?date=2026-06-01")

        mock_occ.assert_called_once_with("2026-06-01")


class TestDocsGenerateEndpoint:
    def test_gera_documento_e_retorna_caminho(self, tmp_path):
        fake_path = str(tmp_path / "ficha_BK001_Joao.docx")
        with patch("api.routes.generate_guest_form", return_value=fake_path):
            resp = client.post(
                "/api/docs/generate",
                params={
                    "booking_id": "BK001",
                    "guest_name": "Joao",
                    "checkin": "2026-06-01",
                    "checkout": "2026-06-05",
                },
            )

        assert resp.status_code == 200
        assert "file" in resp.json()
        assert "BK001" in resp.json()["file"]
