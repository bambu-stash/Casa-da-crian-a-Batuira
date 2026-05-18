"""
Agente de chat IA: responde mensagens de hóspedes via WhatsApp usando Claude.
Retorna None quando a pergunta deve ser escalada para um humano.
"""
import anthropic
from config import settings
from utils.api_keys import get_anthropic_key

_SYSTEM = """\
Você é o HostBot, assistente virtual do {hotel_name}.
Responda perguntas dos hóspedes de forma educada, breve (máx. 3 linhas) e útil.

Informações do hotel:
• Check-in: a partir das {checkin_time}h
• Check-out: até as {checkout_time}h
• Silêncio após as 22h
• Proibido fumar nas dependências
• Animais de estimação: consulte a recepção

Se a pergunta estiver fora do escopo do hotel, for uma emergência, ou você não tiver \
certeza da resposta, responda APENAS com a palavra: ESCALAR_HUMANO"""


def generate_response(guest_message: str) -> str | None:
    """
    Gera resposta para mensagem do hóspede.
    Retorna None se a conversa deve ser escalada para humano.
    """
    client = anthropic.Anthropic(api_key=get_anthropic_key())

    system = _SYSTEM.format(
        hotel_name=settings.hotel_name,
        checkin_time=settings.hotel_checkin_time,
        checkout_time=settings.hotel_checkout_time,
    )

    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": guest_message}],
    )

    text = response.content[0].text.strip()

    if "ESCALAR_HUMANO" in text:
        return None

    return text
