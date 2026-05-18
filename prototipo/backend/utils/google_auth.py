"""
Autenticação Google OAuth2 unificada para Gmail + Sheets.
Todas as APIs compartilham o mesmo token salvo em data/google_token.json.
"""
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from config import settings

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]


def get_credentials() -> Credentials:
    """Retorna credenciais válidas, renovando ou abrindo o browser se necessário."""
    token_path = Path(settings.google_token_file)
    creds_path = Path(settings.google_credentials_file)

    creds: Credentials | None = None

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        if not creds_path.exists():
            raise FileNotFoundError(
                f"Arquivo de credenciais não encontrado: {creds_path}\n"
                "Baixe o OAuth 2.0 JSON do Google Cloud Console e salve nesse caminho."
            )
        flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
        creds = flow.run_local_server(port=0, open_browser=True)

    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json())
    return creds
