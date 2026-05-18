"""TDD – agents/sheets_agent.py"""
from datetime import date
from unittest.mock import MagicMock, patch, call

import pytest

from agents.sheets_agent import upsert_reservation, get_occupancy
from agents.gmail_agent import Reservation


def _make_reservation(**kwargs):
    defaults = dict(
        guest_name="Teste", guest_email="t@t.com", guest_phone="11999990000",
        checkin="2026-06-01", checkout="2026-06-05",
        room="101", platform="booking", booking_id="BK001", is_cancellation=False,
    )
    defaults.update(kwargs)
    return Reservation(**defaults)


class TestUpsertReservation:
    def test_insere_nova_reserva(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = []

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            upsert_reservation(_make_reservation())

        mock_ws.append_row.assert_called_once()
        row = mock_ws.append_row.call_args[0][0]
        assert "BK001" in row
        assert "Confirmado" in row

    def test_atualiza_reserva_existente(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = [
            {"ID Reserva": "BK001", "Hóspede": "Antigo Nome"},
        ]

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            upsert_reservation(_make_reservation(guest_name="Novo Nome"))

        mock_ws.update.assert_called_once()
        mock_ws.append_row.assert_not_called()

    def test_cancelamento_marca_status_cancelado(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = []

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            upsert_reservation(_make_reservation(is_cancellation=True))

        row = mock_ws.append_row.call_args[0][0]
        assert "Cancelado" in row

    def test_booking_id_como_string_na_comparacao(self):
        """booking_id numérico deve dar match com registro string."""
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = [
            {"ID Reserva": "999"},
        ]

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            upsert_reservation(_make_reservation(booking_id=999))

        mock_ws.update.assert_called_once()


class TestGetOccupancy:
    def _records(self):
        return [
            {"ID Reserva": "A", "Hóspede": "H1", "Check-in": "2026-06-01",
             "Check-out": "2026-06-05", "Status": "Confirmado"},
            {"ID Reserva": "B", "Hóspede": "H2", "Check-in": "2026-06-10",
             "Check-out": "2026-06-15", "Status": "Confirmado"},
            {"ID Reserva": "C", "Hóspede": "H3", "Check-in": "2026-06-01",
             "Check-out": "2026-06-03", "Status": "Cancelado"},
        ]

    def test_sem_data_retorna_todos_confirmados(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = self._records()

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            result = get_occupancy()

        assert len(result) == 2
        assert all(r["Status"] == "Confirmado" for r in result)

    def test_filtra_por_data_dentro_do_periodo(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = self._records()

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            result = get_occupancy("2026-06-02")

        assert len(result) == 1
        assert result[0]["ID Reserva"] == "A"

    def test_data_checkout_nao_inclui_no_resultado(self):
        """checkout é exclusive: hóspede que sai no dia não está mais presente."""
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = self._records()

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            result = get_occupancy("2026-06-05")

        ids = [r["ID Reserva"] for r in result]
        assert "A" not in ids

    def test_data_sem_reservas_retorna_lista_vazia(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = self._records()

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            result = get_occupancy("2020-01-01")

        assert result == []

    def test_ignora_registros_com_data_invalida(self):
        mock_ws = MagicMock()
        mock_ws.get_all_records.return_value = [
            {"ID Reserva": "X", "Hóspede": "Erro", "Check-in": "invalido",
             "Check-out": "invalido", "Status": "Confirmado"},
        ]

        with patch("agents.sheets_agent._get_sheet", return_value=mock_ws):
            result = get_occupancy("2026-06-01")

        assert result == []
