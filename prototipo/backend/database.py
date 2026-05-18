"""
SQLite — setores, atendentes, conversas, mensagens, api_keys.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "batuira.db"

_DDL = """
CREATE TABLE IF NOT EXISTS sectors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    emoji       TEXT    DEFAULT '',
    menu_order  INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attendants (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    sector_id        INTEGER NOT NULL REFERENCES sectors(id),
    whatsapp_number  TEXT    DEFAULT '',
    email            TEXT    DEFAULT '',
    supabase_user_id TEXT    DEFAULT '',
    active           INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_phone TEXT    NOT NULL,
    contact_name  TEXT    DEFAULT '',
    sector_id     INTEGER REFERENCES sectors(id),
    attendant_id  INTEGER REFERENCES attendants(id),
    status        TEXT    DEFAULT 'pending_menu',
    created_at    TEXT    DEFAULT (datetime('now','localtime')),
    updated_at    TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id),
    content         TEXT    NOT NULL,
    direction       TEXT    DEFAULT 'in',
    created_at      TEXT    DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS api_keys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    user_email   TEXT NOT NULL,
    key_prefix   TEXT NOT NULL,
    key_hash     TEXT NOT NULL,
    created_at   TEXT DEFAULT (datetime('now','localtime')),
    last_used_at TEXT,
    active       INTEGER DEFAULT 1
);
"""

_DEFAULT_SECTORS = [
    ("Financeiro",       "Pagamentos, mensalidades e boletos",         "💰", 1),
    ("Pedagógico",       "Professores, atividades e desenvolvimento",  "📚", 2),
    ("Administrativo",   "Matrículas, documentos e secretaria",        "🗂️", 3),
    ("Assistência Social","Atendimento social e encaminhamentos",      "🤝", 4),
]


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(_DDL)
        if conn.execute("SELECT COUNT(*) FROM sectors").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO sectors (name, description, emoji, menu_order) VALUES (?,?,?,?)",
                _DEFAULT_SECTORS,
            )


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
