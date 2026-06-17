from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

BASE_DIR = Path(__file__).parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

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
    supabase_service_key: str = ""  # service_role key — necessário para criar usuários via Admin API


settings = Settings()
