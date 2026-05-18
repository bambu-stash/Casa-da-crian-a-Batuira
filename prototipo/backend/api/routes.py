"""
Rotas da API — Casa da Criança Batuira Bot.
"""
import hashlib
import secrets
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.whatsapp_agent import WhatsAppAgent
from database import get_conn
from utils.auth import require_auth
from utils.api_keys import get_evolution_key, get_evolution_url, get_evolution_instance
from utils.settings_store import get_settings, update_settings
from config import settings

router = APIRouter(prefix="/api")
wa = WhatsAppAgent()
Auth = Annotated[dict, Depends(require_auth)]


# ── Pydantic models ───────────────────────────────────────────────────────────

class SettingsPatch(BaseModel):
    org_name: str | None = None
    bot_enabled: bool | None = None
    bot_fallback_phone: str | None = None
    evolution_api_key: str | None = None
    evolution_api_url: str | None = None
    evolution_instance: str | None = None
    anthropic_api_key: str | None = None


class SectorBody(BaseModel):
    name: str
    description: str = ""
    emoji: str = ""
    menu_order: int = 0
    active: bool = True


class AttendantBody(BaseModel):
    name: str
    sector_id: int
    whatsapp_number: str = ""
    email: str = ""
    supabase_user_id: str = ""
    active: bool = True


class ReplyBody(BaseModel):
    text: str


class ApiKeyBody(BaseModel):
    name: str
    user_email: str


class _WaKey(BaseModel):
    remoteJid: str = ""
    fromMe: bool = False
    id: str = ""


class _WaMessage(BaseModel):
    conversation: str | None = None
    extendedTextMessage: dict | None = None


class _WaData(BaseModel):
    key: _WaKey = _WaKey()
    pushName: str = ""
    message: _WaMessage | None = None
    messageType: str = ""


class WebhookPayload(BaseModel):
    event: str = ""
    instance: str = ""
    data: _WaData = _WaData()


# ── Health / Settings ─────────────────────────────────────────────────────────

@router.get("/health")
def health():
    evolution_ok = bool(get_evolution_key())
    anthropic_ok = bool(settings.anthropic_api_key)
    return {
        "status": "ok",
        "services": {
            "evolution_api": "configured" if evolution_ok else "missing_key",
            "anthropic": "configured" if anthropic_ok else "missing_key",
        },
    }


@router.get("/whatsapp/qrcode")
async def get_qrcode(_: Auth):
    url = get_evolution_url()
    key = get_evolution_key()
    instance = get_evolution_instance()
    if not url or not key or not instance:
        raise HTTPException(status_code=400, detail="Evolution API não configurada")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{url.rstrip('/')}/instance/connect/{instance}",
                headers={"apikey": key},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Evolution API retornou {r.status_code}")
        data = r.json()
        # Evolution API v2 returns {"base64": "data:image/png;base64,...", "code": "...", "count": ...}
        base64_img = data.get("base64") or data.get("qrcode", {}).get("base64") or ""
        pairingCode = data.get("code") or data.get("pairingCode") or ""
        return {"base64": base64_img, "pairing_code": pairingCode}
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Não foi possível conectar à Evolution API: {e}")


@router.get("/settings")
def read_settings():
    return get_settings()


@router.patch("/settings")
def patch_settings(payload: SettingsPatch, _: Auth):
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    return update_settings(patch)


# ── WhatsApp Webhook ──────────────────────────────────────────────────────────

@router.post("/whatsapp/webhook")
async def whatsapp_webhook(payload: WebhookPayload):
    if payload.event not in ("messages.upsert", "message"):
        return {"ignored": True}

    data = payload.data
    if data.key.fromMe:
        return {"ignored": True}

    phone_jid = data.key.remoteJid
    if "@g.us" in phone_jid:
        return {"ignored": True, "reason": "group_message"}

    phone = phone_jid.split("@")[0]
    contact_name = data.pushName or ""

    msg = data.message
    text = ""
    if msg:
        text = msg.conversation or (msg.extendedTextMessage or {}).get("text", "") or ""
    text = text.strip()

    if not text:
        return {"ignored": True}

    runtime = get_settings()
    if not runtime.get("bot_enabled", True):
        return {"ignored": True, "reason": "bot_disabled"}

    with get_conn() as conn:
        # Busca conversa aberta para este contato
        conv = conn.execute(
            "SELECT * FROM conversations WHERE contact_phone=? AND status NOT IN ('closed') "
            "ORDER BY id DESC LIMIT 1",
            (phone,),
        ).fetchone()

        # Palavra-chave para reiniciar menu
        if text.lower() in ("menu", "inicio", "início", "0", "voltar"):
            if conv:
                conn.execute(
                    "UPDATE conversations SET status='pending_menu', updated_at=datetime('now','localtime') WHERE id=?",
                    (conv["id"],),
                )
            else:
                conv_id = conn.execute(
                    "INSERT INTO conversations (contact_phone, contact_name, status) VALUES (?,?,?)",
                    (phone, contact_name, "pending_menu"),
                ).lastrowid
                conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
            sectors = [dict(r) for r in conn.execute(
                "SELECT * FROM sectors WHERE active=1 ORDER BY menu_order"
            ).fetchall()]
            wa.send_menu(phone, contact_name, sectors)
            return {"action": "menu_sent"}

        # Sem conversa aberta → criar e enviar menu
        if not conv:
            conv_id = conn.execute(
                "INSERT INTO conversations (contact_phone, contact_name, status) VALUES (?,?,?)",
                (phone, contact_name, "pending_menu"),
            ).lastrowid
            conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
            sectors = [dict(r) for r in conn.execute(
                "SELECT * FROM sectors WHERE active=1 ORDER BY menu_order"
            ).fetchall()]
            wa.send_menu(phone, contact_name, sectors)
            return {"action": "menu_sent"}

        # Aguardando escolha de setor
        if conv["status"] == "pending_menu":
            sectors = [dict(r) for r in conn.execute(
                "SELECT * FROM sectors WHERE active=1 ORDER BY menu_order"
            ).fetchall()]
            max_opt = max((s["menu_order"] for s in sectors), default=0)

            if text.isdigit() and 1 <= int(text) <= max_opt:
                chosen = next((s for s in sectors if s["menu_order"] == int(text)), None)
                if chosen:
                    conn.execute(
                        "UPDATE conversations SET sector_id=?, status='waiting', "
                        "updated_at=datetime('now','localtime') WHERE id=?",
                        (chosen["id"], conv["id"]),
                    )
                    conn.execute(
                        "INSERT INTO messages (conversation_id, content, direction) VALUES (?,?,?)",
                        (conv["id"], text, "in"),
                    )
                    wa.send_sector_confirmation(phone, chosen["name"])
                    return {"action": "sector_assigned", "sector": chosen["name"]}

            wa.send_invalid_option(phone, max_opt)
            return {"action": "invalid_option"}

        # Conversa em espera ou ativa → salvar mensagem no histórico
        if conv["status"] in ("waiting", "active"):
            conn.execute(
                "INSERT INTO messages (conversation_id, content, direction) VALUES (?,?,?)",
                (conv["id"], text, "in"),
            )
            conn.execute(
                "UPDATE conversations SET updated_at=datetime('now','localtime') WHERE id=?",
                (conv["id"],),
            )
            return {"action": "message_stored"}

    return {"ignored": True}


# ── Setores ───────────────────────────────────────────────────────────────────

@router.get("/sectors")
def list_sectors():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM sectors ORDER BY menu_order").fetchall()
        return [dict(r) for r in rows]


@router.post("/sectors", status_code=201)
def create_sector(body: SectorBody, _: Auth):
    with get_conn() as conn:
        row_id = conn.execute(
            "INSERT INTO sectors (name, description, emoji, menu_order, active) VALUES (?,?,?,?,?)",
            (body.name, body.description, body.emoji, body.menu_order, int(body.active)),
        ).lastrowid
        return dict(conn.execute("SELECT * FROM sectors WHERE id=?", (row_id,)).fetchone())


@router.put("/sectors/{sector_id}")
def update_sector(sector_id: int, body: SectorBody, _: Auth):
    with get_conn() as conn:
        conn.execute(
            "UPDATE sectors SET name=?, description=?, emoji=?, menu_order=?, active=? WHERE id=?",
            (body.name, body.description, body.emoji, body.menu_order, int(body.active), sector_id),
        )
        row = conn.execute("SELECT * FROM sectors WHERE id=?", (sector_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Setor não encontrado")
        return dict(row)


@router.delete("/sectors/{sector_id}", status_code=204)
def delete_sector(sector_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute("DELETE FROM sectors WHERE id=?", (sector_id,))


# ── Atendentes ────────────────────────────────────────────────────────────────

@router.get("/attendants")
def list_attendants():
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id = s.id ORDER BY a.name"
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/attendants", status_code=201)
def create_attendant(body: AttendantBody, _: Auth):
    with get_conn() as conn:
        row_id = conn.execute(
            "INSERT INTO attendants (name, sector_id, whatsapp_number, email, supabase_user_id, active) "
            "VALUES (?,?,?,?,?,?)",
            (body.name, body.sector_id, body.whatsapp_number, body.email,
             body.supabase_user_id, int(body.active)),
        ).lastrowid
        row = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id WHERE a.id=?", (row_id,)
        ).fetchone()
        return dict(row)


@router.put("/attendants/{attendant_id}")
def update_attendant(attendant_id: int, body: AttendantBody, _: Auth):
    with get_conn() as conn:
        conn.execute(
            "UPDATE attendants SET name=?, sector_id=?, whatsapp_number=?, email=?, "
            "supabase_user_id=?, active=? WHERE id=?",
            (body.name, body.sector_id, body.whatsapp_number, body.email,
             body.supabase_user_id, int(body.active), attendant_id),
        )
        row = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id WHERE a.id=?", (attendant_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Atendente não encontrado")
        return dict(row)


@router.delete("/attendants/{attendant_id}", status_code=204)
def delete_attendant(attendant_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute("DELETE FROM attendants WHERE id=?", (attendant_id,))


# ── Conversas ─────────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    _: Auth,
    status: str | None = None,
    sector_id: int | None = None,
    attendant_id: int | None = None,
):
    query = (
        "SELECT c.*, s.name AS sector_name, s.emoji AS sector_emoji, "
        "a.name AS attendant_name, "
        "(SELECT content FROM messages m1 WHERE m1.conversation_id=c.id "
        " AND m1.direction='in' ORDER BY m1.id DESC LIMIT 1) AS last_message, "
        "(SELECT COUNT(*) FROM messages m2 WHERE m2.conversation_id=c.id "
        " AND m2.direction='in' AND m2.id > COALESCE("
        "   (SELECT id FROM messages m3 WHERE m3.conversation_id=c.id "
        "    AND m3.direction='out' ORDER BY m3.id DESC LIMIT 1), 0)) AS unread_count "
        "FROM conversations c "
        "LEFT JOIN sectors s ON c.sector_id = s.id "
        "LEFT JOIN attendants a ON c.attendant_id = a.id "
        "WHERE 1=1 "
    )
    params: list = []
    if status:
        query += " AND c.status=? "
        params.append(status)
    if sector_id:
        query += " AND c.sector_id=? "
        params.append(sector_id)
    if attendant_id:
        query += " AND c.attendant_id=? "
        params.append(attendant_id)
    query += " ORDER BY c.updated_at DESC LIMIT 200"

    with get_conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int, _: Auth):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT c.*, s.name AS sector_name, s.emoji AS sector_emoji, "
            "a.name AS attendant_name FROM conversations c "
            "LEFT JOIN sectors s ON c.sector_id = s.id "
            "LEFT JOIN attendants a ON c.attendant_id = a.id WHERE c.id=?",
            (conv_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        return dict(row)


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: int, _: Auth):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY id",
            (conv_id,),
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/conversations/{conv_id}/assign")
def assign_conversation(conv_id: int, attendant_id: int, _: Auth):
    with get_conn() as conn:
        conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")

        attendant = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id WHERE a.id=? AND a.active=1",
            (attendant_id,),
        ).fetchone()
        if not attendant:
            raise HTTPException(status_code=404, detail="Atendente não encontrado")

        conn.execute(
            "UPDATE conversations SET attendant_id=?, status='active', "
            "updated_at=datetime('now','localtime') WHERE id=?",
            (attendant_id, conv_id),
        )

        # Notifica o contato
        wa.send_attendant_greeting(
            conv["contact_phone"],
            attendant["name"],
            attendant["sector_name"] or "",
        )

        return {"success": True, "attendant": dict(attendant)}


@router.post("/conversations/{conv_id}/reply")
def reply_conversation(conv_id: int, body: ReplyBody, _: Auth):
    with get_conn() as conn:
        conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        # Save to DB first — message is not lost even if Evolution API is offline
        conn.execute(
            "INSERT INTO messages (conversation_id, content, direction) VALUES (?,?,?)",
            (conv_id, body.text, "out"),
        )
        conn.execute(
            "UPDATE conversations SET updated_at=datetime('now','localtime') WHERE id=?",
            (conv_id,),
        )
    phone = conv["contact_phone"]
    result = wa.send_text(phone, body.text)
    if not result["success"]:
        return {"success": True, "warning": "Mensagem salva mas não enviada: " + result.get("error", "")}
    return {"success": True}


@router.post("/conversations/{conv_id}/close")
def close_conversation(conv_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute(
            "UPDATE conversations SET status='closed', updated_at=datetime('now','localtime') WHERE id=?",
            (conv_id,),
        )
        return {"success": True}


# ── Stats para o dashboard ────────────────────────────────────────────────────

@router.get("/dashboard/stats")
def dashboard_stats(_: Auth):
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM conversations").fetchone()[0]
        waiting = conn.execute(
            "SELECT COUNT(*) FROM conversations WHERE status='waiting'"
        ).fetchone()[0]
        active = conn.execute(
            "SELECT COUNT(*) FROM conversations WHERE status='active'"
        ).fetchone()[0]
        by_sector = conn.execute(
            "SELECT s.name, s.emoji, COUNT(c.id) AS total, "
            "SUM(CASE WHEN c.status='waiting' THEN 1 ELSE 0 END) AS waiting "
            "FROM sectors s LEFT JOIN conversations c ON c.sector_id=s.id AND c.status!='closed' "
            "GROUP BY s.id ORDER BY s.menu_order"
        ).fetchall()
        return {
            "total_conversations": total,
            "waiting": waiting,
            "active": active,
            "by_sector": [dict(r) for r in by_sector],
        }


# ── API Keys ──────────────────────────────────────────────────────────────────

@router.get("/api-keys")
def list_api_keys(_: Auth):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, user_email, key_prefix, created_at, last_used_at, active "
            "FROM api_keys ORDER BY created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/api-keys", status_code=201)
def create_api_key(body: ApiKeyBody, _: Auth):
    raw = "btr_" + secrets.token_hex(32)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    key_prefix = raw[:12] + "…"

    with get_conn() as conn:
        row_id = conn.execute(
            "INSERT INTO api_keys (name, user_email, key_prefix, key_hash) VALUES (?,?,?,?)",
            (body.name, body.user_email, key_prefix, key_hash),
        ).lastrowid
        row = conn.execute(
            "SELECT id, name, user_email, key_prefix, created_at FROM api_keys WHERE id=?",
            (row_id,),
        ).fetchone()
        result = dict(row)
        result["key"] = raw  # só exibido uma vez
        return result


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_api_key(key_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute("UPDATE api_keys SET active=0 WHERE id=?", (key_id,))
