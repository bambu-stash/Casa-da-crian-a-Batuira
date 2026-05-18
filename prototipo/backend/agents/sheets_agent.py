"""
Sub-agente de planilha: atualiza Google Sheets com check-in/out.
"""
from datetime import datetime

import gspread

from config import settings
from utils.google_auth import get_credentials

HEADERS = [
    "ID Reserva", "Hóspede", "Telefone", "E-mail",
    "Plataforma", "Check-in", "Check-out", "Quarto", "Status",
]


def _get_sheet():
    gc = gspread.authorize(get_credentials())
    sh = gc.open_by_key(settings.sheets_id)
    try:
        ws = sh.worksheet("Reservas")
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet("Reservas", rows=500, cols=len(HEADERS))
        ws.append_row(HEADERS)
    return ws


def upsert_reservation(reservation) -> None:
    """Insere ou atualiza linha na planilha com base no booking_id."""
    ws = _get_sheet()
    records = ws.get_all_records()

    row_data = [
        reservation.booking_id,
        reservation.guest_name,
        reservation.guest_phone,
        reservation.guest_email,
        reservation.platform,
        reservation.checkin,
        reservation.checkout,
        reservation.room,
        "Cancelado" if reservation.is_cancellation else "Confirmado",
    ]

    for i, rec in enumerate(records, start=2):
        if str(rec.get("ID Reserva")) == str(reservation.booking_id):
            ws.update(f"A{i}:I{i}", [row_data])
            return

    ws.append_row(row_data)


def get_occupancy(date: str | None = None) -> list[dict]:
    """Retorna todas as reservas ativas para uma data (YYYY-MM-DD), ou todas se None."""
    ws = _get_sheet()
    records = ws.get_all_records()

    if not date:
        return [r for r in records if r.get("Status") == "Confirmado"]

    result = []
    for rec in records:
        if rec.get("Status") != "Confirmado":
            continue
        try:
            ci = datetime.strptime(rec["Check-in"], "%Y-%m-%d").date()
            co = datetime.strptime(rec["Check-out"], "%Y-%m-%d").date()
            target = datetime.strptime(date, "%Y-%m-%d").date()
            if ci <= target < co:
                result.append(rec)
        except (ValueError, KeyError):
            continue

    return result
