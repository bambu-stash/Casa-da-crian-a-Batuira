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
    active      INTEGER DEFAULT 1,
    institution TEXT    DEFAULT 'crianca'
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
    status        TEXT    DEFAULT 'pending_institution',
    institution   TEXT    DEFAULT '',
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

CREATE TABLE IF NOT EXISTS conversation_transfers (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id   INTEGER NOT NULL REFERENCES conversations(id),
    from_sector_id    INTEGER REFERENCES sectors(id),
    to_sector_id      INTEGER NOT NULL REFERENCES sectors(id),
    from_attendant_id INTEGER REFERENCES attendants(id),
    created_at        TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS contacts (
    phone         TEXT PRIMARY KEY,
    name_override TEXT DEFAULT '',
    notes         TEXT DEFAULT '',
    updated_at    TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS quick_replies (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    shortcut   TEXT DEFAULT '',
    active     INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS flows (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL DEFAULT 'Flow Principal',
    nodes      TEXT    NOT NULL DEFAULT '[]',
    edges      TEXT    NOT NULL DEFAULT '[]',
    active     INTEGER DEFAULT 1,
    created_at TEXT    DEFAULT (datetime('now','localtime')),
    updated_at TEXT    DEFAULT (datetime('now','localtime'))
);
"""

# (name, description, emoji, menu_order, institution)
_DEFAULT_SECTORS = [
    ("Financeiro",        "Pagamentos, mensalidades e boletos",        "💰", 1, "crianca"),
    ("Pedagógico",        "Professores, atividades e desenvolvimento", "📚", 2, "crianca"),
    ("Administrativo",    "Matrículas, documentos e secretaria",       "🗂️", 3, "crianca"),
    ("Assistência Social","Atendimento social e encaminhamentos",      "🤝", 4, "crianca"),
    ("Financeiro",        "Pagamentos, mensalidades e boletos",        "💰", 1, "mae"),
    ("Pedagógico",        "Professores, atividades e desenvolvimento", "📚", 2, "mae"),
    ("Administrativo",    "Matrículas, documentos e secretaria",       "🗂️", 3, "mae"),
    ("Assistência Social","Atendimento social e encaminhamentos",      "🤝", 4, "mae"),
]


def _migrate(conn: sqlite3.Connection) -> None:
    """Aplica migrações incrementais ao banco existente."""
    for col, table, default in [
        ("institution",  "sectors",       "'crianca'"),
        ("institution",  "conversations", "''"),
        ("csat_rating",  "conversations", "NULL"),
        ("role",          "attendants",    "''"),
        ("avatar_url",    "attendants",    "''"),
        ("bio",           "attendants",    "''"),
        ("password_hash", "attendants",    "''"),
    ]:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} TEXT DEFAULT {default}")
        except sqlite3.OperationalError:
            pass  # coluna já existe

    # Garante que setores existentes sem institution recebam 'crianca'
    conn.execute("UPDATE sectors SET institution='crianca' WHERE institution IS NULL OR institution=''")

    # Insere setores da Casa da Mãe se ainda não existirem
    if conn.execute("SELECT COUNT(*) FROM sectors WHERE institution='mae'").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO sectors (name, description, emoji, menu_order, institution) VALUES (?,?,?,?,?)",
            [s for s in _DEFAULT_SECTORS if s[4] == "mae"],
        )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(_DDL)
        _migrate(conn)
        if conn.execute("SELECT COUNT(*) FROM sectors WHERE institution='crianca'").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO sectors (name, description, emoji, menu_order, institution) VALUES (?,?,?,?,?)",
                [s for s in _DEFAULT_SECTORS if s[4] == "crianca"],
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
