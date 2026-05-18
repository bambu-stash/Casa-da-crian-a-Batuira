"""
Leitura e escrita de configurações em tempo de execução (data/settings_override.json).
"""
import json
from pathlib import Path
from config import settings as _env

_OVERRIDE_FILE = Path(__file__).parent.parent / "data" / "settings_override.json"

_ALLOWED_KEYS = {
    "org_name",
    "bot_enabled",
    "bot_fallback_phone",
    "anthropic_api_key",
    "evolution_api_key",
    "evolution_api_url",
    "evolution_instance",
}

_SENSITIVE_KEYS = {"anthropic_api_key", "evolution_api_key"}


def _load() -> dict:
    if _OVERRIDE_FILE.exists():
        try:
            return json.loads(_OVERRIDE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _mask(value: str) -> str:
    if not value:
        return ""
    return "****" + value[-4:] if len(value) > 4 else "****"


def get_settings() -> dict:
    base = {
        "org_name": _env.org_name,
        "bot_enabled": True,
        "bot_fallback_phone": _env.bot_fallback_phone,
        "anthropic_api_key": _mask(_env.anthropic_api_key),
        "evolution_api_key": _mask(_env.evolution_api_key),
        "evolution_api_url": _env.evolution_api_url,
        "evolution_instance": _env.evolution_instance,
    }
    overrides = _load()
    for k, v in overrides.items():
        if k in _SENSITIVE_KEYS:
            base[k] = _mask(v)
        else:
            base[k] = v
    return base


def update_settings(patch: dict) -> dict:
    current = _load()
    for k, v in patch.items():
        if k in _ALLOWED_KEYS:
            current[k] = v
    _OVERRIDE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _OVERRIDE_FILE.write_text(json.dumps(current, ensure_ascii=False, indent=2))
    return get_settings()
