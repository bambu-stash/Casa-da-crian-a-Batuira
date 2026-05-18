"""
Agente WhatsApp — Evolution API.
Gerencia menu de setores, roteamento de conversas e respostas de atendentes.
"""
import httpx

from config import settings
from utils.phone import sanitize_whatsapp_number
from utils.api_keys import get_evolution_key, get_evolution_url, get_evolution_instance

MENU_TEMPLATE = """Olá{name_part}! 👋

Bem-vindo à *{org_name}*.

Como podemos te ajudar? Escolha uma opção:

{options}

Digite o *número* da opção desejada."""

SECTOR_CONFIRMATION = (
    "✅ Perfeito! Sua mensagem foi direcionada para o setor *{sector}*.\n\n"
    "Aguarde — em breve um de nossos atendentes estará com você. 😊"
)

ATTENDANT_GREETING = (
    "Olá! Aqui é *{attendant_name}* do setor *{sector_name}*. "
    "Como posso te ajudar?"
)

INVALID_OPTION = (
    "Opção inválida. Por favor, digite um número de *1* a *{max_option}* "
    "para escolher o setor desejado."
)


class WhatsAppAgent:
    def _url(self, path: str) -> str:
        return f"{get_evolution_url()}/{path}/{get_evolution_instance()}"

    def _headers(self) -> dict:
        return {"apikey": get_evolution_key(), "Content-Type": "application/json"}

    def _post(self, path: str, payload: dict) -> dict:
        try:
            resp = httpx.post(
                self._url(path), json=payload, headers=self._headers(), timeout=15
            )
            resp.raise_for_status()
            return {"success": True, "data": resp.json()}
        except httpx.HTTPError as e:
            return {"success": False, "error": str(e)}

    # ── Public API ────────────────────────────────────────────────────────────

    def send_text(self, phone_raw: str, text: str) -> dict:
        phone = sanitize_whatsapp_number(phone_raw)
        if not phone:
            return {"success": False, "error": f"Número inválido: {phone_raw}"}
        return self._post("message/sendText", {"number": phone, "text": text})

    def send_menu(self, phone_raw: str, contact_name: str, sectors: list[dict]) -> dict:
        """Envia menu numerado com os setores ativos."""
        name_part = f", {contact_name}" if contact_name else ""
        options = "\n".join(
            f"{s['menu_order']}️⃣ {s['emoji']} *{s['name']}*"
            for s in sorted(sectors, key=lambda x: x["menu_order"])
        )
        text = MENU_TEMPLATE.format(
            name_part=name_part,
            org_name=settings.org_name,
            options=options,
        )
        return self.send_text(phone_raw, text)

    def send_sector_confirmation(self, phone_raw: str, sector_name: str) -> dict:
        text = SECTOR_CONFIRMATION.format(sector=sector_name)
        return self.send_text(phone_raw, text)

    def send_attendant_greeting(
        self, phone_raw: str, attendant_name: str, sector_name: str
    ) -> dict:
        text = ATTENDANT_GREETING.format(
            attendant_name=attendant_name, sector_name=sector_name
        )
        return self.send_text(phone_raw, text)

    def send_invalid_option(self, phone_raw: str, max_option: int) -> dict:
        text = INVALID_OPTION.format(max_option=max_option)
        return self.send_text(phone_raw, text)

    def send_fallback_alert(self, phone_raw: str, original_message: str) -> dict:
        """Notifica responsável quando não há atendente disponível."""
        phone = sanitize_whatsapp_number(phone_raw)
        if not phone:
            return {"success": False, "error": "Número inválido"}
        text = (
            "⚠️ *ATENDIMENTO PENDENTE*\n\n"
            f"Mensagem sem atendente disponível:\n_{original_message}_"
        )
        return self._post("message/sendText", {"number": phone, "text": text})
