"""
Agente WhatsApp — Evolution API.
Gerencia menu de setores, roteamento de conversas e respostas de atendentes.
"""
import httpx

from config import settings
from utils.phone import sanitize_whatsapp_number
from utils.api_keys import get_evolution_key, get_evolution_url, get_evolution_instance

INSTITUTION_MENU_TEMPLATE = """Olá{name_part}! 👋

Por favor, selecione a instituição que deseja contatar:

1️⃣ 🏠 *Casa da Criança Batuira*
2️⃣ 💗 *Casa da Mãe Batuira*

Digite o *número* da opção desejada.

_Digite *0* a qualquer momento para recomeçar._"""

MENU_TEMPLATE = """Ótimo! Você escolheu *{institution_name}*. 😊

Como podemos te ajudar? Escolha um setor:

{options}

Digite o *número* da opção desejada.

_Digite *0* a qualquer momento para recomeçar._"""

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

INVALID_INSTITUTION = (
    "Opção inválida. Por favor, selecione a instituição digitando *1* ou *2*:\n\n"
    "1️⃣ 🏠 *Casa da Criança Batuira*\n"
    "2️⃣ 💗 *Casa da Mãe Batuira*\n\n"
    "_Digite *0* a qualquer momento para recomeçar._"
)

INVALID_SECTOR_WITH_MENU = (
    "❌ Opção inválida. Por favor, escolha um dos setores abaixo:\n\n"
    "{options}\n\n"
    "Digite o *número* da opção desejada.\n\n"
    "_Digite *0* a qualquer momento para recomeçar._"
)

QUEUE_POSITION = (
    "⏳ Você está na *{position}ª posição* da fila do setor *{sector}*.\n\n"
    "Em breve um atendente estará com você!"
)

CLOSE_CONFIRMATION = (
    "✅ Seu atendimento foi concluído!\n\n"
    "Como você avalia nosso atendimento hoje?\n\n"
    "1️⃣ Ótimo\n"
    "2️⃣ Bom\n"
    "3️⃣ Regular\n"
    "4️⃣ Ruim\n\n"
    "Digite o número da sua avaliação."
)

CSAT_THANKS = "⭐ Obrigado pela sua avaliação! Até a próxima. 😊"

ATTENDANT_NOTIFICATION = (
    "🔔 *NOVO CONTATO AGUARDANDO*\n\n"
    "👤 *{contact_name}*\n"
    "📱 {contact_phone}\n"
    "🏢 Setor: *{sector_name}*\n\n"
    "Acesse o painel para atender."
)

OFF_HOURS = (
    "⏰ Olá! No momento estamos fora do horário de atendimento.\n\n"
    "Nosso horário é de *{start}* às *{end}*{days_part}.\n\n"
    "Sua mensagem foi registrada e entraremos em contato assim que possível. 😊"
)

TIMEOUT_NOTICE = (
    "⏳ Sua conversa foi encerrada por inatividade.\n\n"
    "Se precisar de ajuda, é só enviar uma mensagem! 😊"
)

TRANSFER_NOTICE = (
    "🔄 Sua conversa foi transferida para o setor *{sector}*.\n\n"
    "Aguarde — em breve um atendente estará com você."
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

    def send_institution_menu(self, phone_raw: str, contact_name: str) -> dict:
        """Envia menu de seleção de instituição."""
        name_part = f", {contact_name}" if contact_name else ""
        text = INSTITUTION_MENU_TEMPLATE.format(name_part=name_part)
        return self.send_text(phone_raw, text)

    def send_menu(self, phone_raw: str, institution: str, sectors: list[dict]) -> dict:
        """Envia menu numerado com os setores ativos da instituição escolhida."""
        institution_name = (
            "Casa da Mãe Batuira" if institution == "mae" else "Casa da Criança Batuira"
        )
        options = "\n".join(
            f"{s['menu_order']}️⃣ {s['emoji']} *{s['name']}*"
            for s in sorted(sectors, key=lambda x: x["menu_order"])
        )
        text = MENU_TEMPLATE.format(institution_name=institution_name, options=options)
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

    def send_invalid_institution(self, phone_raw: str) -> dict:
        return self.send_text(phone_raw, INVALID_INSTITUTION)

    def send_invalid_sector_with_menu(self, phone_raw: str, sectors: list[dict]) -> dict:
        options = "\n".join(
            f"{s['menu_order']}️⃣ {s['emoji']} *{s['name']}*"
            for s in sorted(sectors, key=lambda x: x["menu_order"])
        )
        text = INVALID_SECTOR_WITH_MENU.format(options=options)
        return self.send_text(phone_raw, text)

    def send_queue_position(self, phone_raw: str, position: int, sector_name: str) -> dict:
        text = QUEUE_POSITION.format(position=position, sector=sector_name)
        return self.send_text(phone_raw, text)

    def send_close_confirmation(self, phone_raw: str) -> dict:
        return self.send_text(phone_raw, CLOSE_CONFIRMATION)

    def send_csat_thanks(self, phone_raw: str) -> dict:
        return self.send_text(phone_raw, CSAT_THANKS)

    def send_attendant_notification(
        self, phone_raw: str, contact_name: str, contact_phone: str, sector_name: str
    ) -> dict:
        text = ATTENDANT_NOTIFICATION.format(
            contact_name=contact_name or contact_phone,
            contact_phone=contact_phone,
            sector_name=sector_name,
        )
        return self.send_text(phone_raw, text)

    def send_off_hours(self, phone_raw: str, start: str, end: str, days_str: str) -> dict:
        days_part = f", de {days_str}" if days_str else ""
        text = OFF_HOURS.format(start=start, end=end, days_part=days_part)
        return self.send_text(phone_raw, text)

    def send_timeout(self, phone_raw: str) -> dict:
        return self.send_text(phone_raw, TIMEOUT_NOTICE)

    def send_transfer_notification(self, phone_raw: str, sector_name: str) -> dict:
        text = TRANSFER_NOTICE.format(sector=sector_name)
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
