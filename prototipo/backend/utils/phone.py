import phonenumbers


def sanitize_whatsapp_number(raw: str, default_region: str = "BR") -> str | None:
    """Normaliza número para formato internacional sem '+' (Evolution API espera DDI+número)."""
    try:
        parsed = phonenumbers.parse(raw, default_region)
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164).lstrip("+")
    except phonenumbers.NumberParseException:
        return None
