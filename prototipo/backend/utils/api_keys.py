"""
Helper para obter chaves de API respeitando overrides em tempo de execução.
Agents usam estas funções em vez de `settings.*` diretamente.
"""
from config import settings as _env


def _override() -> dict:
    from utils.settings_store import _load
    return _load()


def get_evolution_key() -> str:
    return _override().get("evolution_api_key") or _env.evolution_api_key


def get_evolution_url() -> str:
    return _override().get("evolution_api_url") or _env.evolution_api_url


def get_evolution_instance() -> str:
    return _override().get("evolution_instance") or _env.evolution_instance
