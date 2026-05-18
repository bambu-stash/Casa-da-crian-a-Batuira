from pydantic_settings import BaseSettings
from pathlib import Path

BASE_DIR = Path(__file__).parent


class Settings(BaseSettings):
    # Anthropic
    anthropic_api_key: str = ""

    # Evolution API (WhatsApp)
    evolution_api_url: str = "http://localhost:8080"
    evolution_api_key: str = ""
    evolution_instance: str = "batuira"

    # Organização
    org_name: str = "Casa da Criança Batuira"
    bot_fallback_phone: str = ""

    # Supabase (auth)
    supabase_url: str = ""
    supabase_jwt_secret: str = ""

    class Config:
        env_file = BASE_DIR / ".env"


settings = Settings()
