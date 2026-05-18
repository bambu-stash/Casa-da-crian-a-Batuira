"""Configuração global de testes."""
import os

# Evita carregar .env real durante os testes
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
os.environ.setdefault("EVOLUTION_API_KEY", "test-key")
os.environ.setdefault("EVOLUTION_API_URL", "http://localhost:8080")
os.environ.setdefault("EVOLUTION_INSTANCE", "test")
os.environ.setdefault("GOOGLE_TOKEN_FILE", "/tmp/fake_token.json")
os.environ.setdefault("GOOGLE_CREDENTIALS_FILE", "/tmp/fake_creds.json")
os.environ.setdefault("SHEETS_ID", "fake-sheet-id")
os.environ.setdefault("HOTEL_NAME", "Hotel Teste")
os.environ.setdefault("HOTEL_CHECKIN_TIME", "14:00")
os.environ.setdefault("HOTEL_CHECKOUT_TIME", "11:00")
