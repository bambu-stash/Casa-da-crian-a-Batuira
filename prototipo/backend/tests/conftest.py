"""Configuração global de testes."""
import os

# Definir antes de qualquer import de módulos do projeto
os.environ.setdefault("EVOLUTION_API_KEY", "test-key")
os.environ.setdefault("EVOLUTION_API_URL", "http://localhost:8080")
os.environ.setdefault("EVOLUTION_INSTANCE", "test")
os.environ.setdefault("LOCAL_SECRET", "test-secret-for-jest-only")
os.environ.setdefault("SUPABASE_URL", "")
os.environ.setdefault("SUPABASE_JWT_SECRET", "")

import pytest
from fastapi.testclient import TestClient


# ── DB isolado por teste ───────────────────────────────────────────────────────

@pytest.fixture()
def temp_db(tmp_path, monkeypatch):
    """Banco SQLite temporário, isolado por teste, com schema completo."""
    import database

    db_file = tmp_path / "test.db"
    monkeypatch.setattr(database, "DB_PATH", db_file)
    database.init_db()  # DDL + migrações + setores padrão

    with database.get_conn() as conn:
        conn.execute(
            "INSERT INTO attendants (id, name, sector_id, email, active) "
            "VALUES (1,'Admin',1,'admin@test.com',1)"
        )

    yield db_file


@pytest.fixture()
def auth_token():
    """Token JWT local válido para endpoints autenticados."""
    from utils.auth import create_local_token

    return create_local_token(1, "admin@test.com")


@pytest.fixture()
def client(temp_db):
    """TestClient com DB isolado (sem autenticação no header)."""
    from main import app

    return TestClient(app)


@pytest.fixture()
def auth_client(temp_db, auth_token):
    """TestClient autenticado com DB isolado."""
    from main import app

    return TestClient(app, headers={"Authorization": f"Bearer {auth_token}"})
