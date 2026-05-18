"""
Agente de monitoramento de Gmail.
Lê e-mails do Booking/Airbnb e extrai dados de reserva usando Claude Haiku.
"""
import base64
import json
import re
from dataclasses import dataclass
from datetime import datetime

import anthropic
from googleapiclient.discovery import build

from config import settings
from utils.google_auth import get_credentials
from utils.api_keys import get_anthropic_key

BOOKING_SENDERS = [
    "noreply@booking.com",
    "noreply@airbnb.com",
    "reservations@booking.com",
]


@dataclass
class Reservation:
    guest_name: str
    guest_email: str
    guest_phone: str
    checkin: str
    checkout: str
    room: str
    platform: str
    booking_id: str
    is_cancellation: bool = False
    raw_email_id: str = ""


def _get_gmail_service():
    return build("gmail", "v1", credentials=get_credentials())


def _extract_email_body(msg: dict) -> str:
    payload = msg.get("payload", {})
    parts = payload.get("parts", [])

    def decode_data(data: str) -> str:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")

    if not parts:
        body_data = payload.get("body", {}).get("data", "")
        return decode_data(body_data) if body_data else ""

    for part in parts:
        if part.get("mimeType") == "text/plain":
            return decode_data(part["body"].get("data", ""))

    return ""


def _parse_reservation_with_ai(email_body: str, sender: str) -> dict:
    client = anthropic.Anthropic(api_key=get_anthropic_key())

    prompt = f"""Extraia os dados de reserva deste e-mail de {sender}.
Retorne SOMENTE um JSON válido com as chaves:
guest_name, guest_email, guest_phone, checkin, checkout, room, booking_id, is_cancellation (bool).
Use "" para campos não encontrados. Datas no formato YYYY-MM-DD.

E-MAIL:
{email_body[:3000]}

JSON:"""

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if json_match:
        return json.loads(json_match.group())
    return {}


def fetch_new_reservations(max_results: int = 10) -> list[Reservation]:
    """Busca e-mails não lidos de plataformas de reserva e retorna lista de Reservation."""
    service = _get_gmail_service()
    sender_filter = " OR ".join(f"from:{s}" for s in BOOKING_SENDERS)
    query = f"is:unread ({sender_filter})"

    results = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    messages = results.get("messages", [])
    reservations = []

    for msg_ref in messages:
        msg = service.users().messages().get(
            userId="me", messageId=msg_ref["id"], format="full"
        ).execute()

        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        sender = headers.get("From", "")
        body = _extract_email_body(msg)

        if not body:
            continue

        platform = "booking" if "booking.com" in sender else "airbnb"
        data = _parse_reservation_with_ai(body, sender)

        if data:
            reservations.append(Reservation(
                guest_name=data.get("guest_name", ""),
                guest_email=data.get("guest_email", ""),
                guest_phone=data.get("guest_phone", ""),
                checkin=data.get("checkin", ""),
                checkout=data.get("checkout", ""),
                room=data.get("room", ""),
                platform=platform,
                booking_id=data.get("booking_id", ""),
                is_cancellation=data.get("is_cancellation", False),
                raw_email_id=msg_ref["id"],
            ))

        # Marca e-mail como lido
        service.users().messages().modify(
            userId="me",
            id=msg_ref["id"],
            body={"removeLabelIds": ["UNREAD"]},
        ).execute()

    return reservations
