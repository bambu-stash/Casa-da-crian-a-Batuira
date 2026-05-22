"""
Rotas da API — Casa da Criança Batuira Bot.
"""
import hashlib
import json
import secrets
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.whatsapp_agent import WhatsAppAgent
from database import get_conn
from engine.flow_engine import FlowEngine
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
    business_hours_start: str | None = None
    business_hours_end: str | None = None
    business_days: str | None = None
    off_hours_message: str | None = None
    conversation_timeout_hours: int | None = None


class SectorBody(BaseModel):
    name: str
    description: str = ""
    emoji: str = ""
    menu_order: int = 0
    active: bool = True
    institution: str = "crianca"


class AttendantBody(BaseModel):
    name: str
    sector_id: int
    whatsapp_number: str = ""
    email: str = ""
    supabase_user_id: str = ""
    active: bool = True


class ReplyBody(BaseModel):
    text: str


class TransferBody(BaseModel):
    sector_id: int


class ApiKeyBody(BaseModel):
    name: str
    user_email: str


class FlowBody(BaseModel):
    name: str = "Flow Principal"
    nodes: list = []
    edges: list = []


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


# ── Helpers internos ─────────────────────────────────────────────────────────

_DAYS_PT = {0: "Seg", 1: "Ter", 2: "Qua", 3: "Qui", 4: "Sex", 5: "Sáb", 6: "Dom"}


def _format_business_days(days_str: str) -> str:
    try:
        nums = sorted(int(d.strip()) for d in days_str.split(",") if d.strip())
    except ValueError:
        return ""
    names = [_DAYS_PT.get(n, str(n)) for n in nums]
    if not names:
        return ""
    return f"{names[0]} a {names[-1]}" if len(names) > 1 else names[0]


def _is_business_hours(runtime: dict) -> bool:
    start_str = runtime.get("business_hours_start", "08:00")
    end_str = runtime.get("business_hours_end", "18:00")
    days_str = runtime.get("business_days", "0,1,2,3,4")
    now = datetime.now()
    try:
        allowed_days = [int(d.strip()) for d in days_str.split(",") if d.strip()]
    except ValueError:
        allowed_days = [0, 1, 2, 3, 4]
    if now.weekday() not in allowed_days:
        return False
    try:
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))
    except (ValueError, AttributeError):
        return True
    start = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = now.replace(hour=eh, minute=em, second=0, microsecond=0)
    return start <= now <= end


def _load_flow_engine(conn) -> FlowEngine | None:
    """Carrega o flow ativo do banco e retorna um FlowEngine, ou None se não houver."""
    row = conn.execute(
        "SELECT * FROM flows WHERE active=1 ORDER BY updated_at DESC LIMIT 1"
    ).fetchone()
    if not row:
        return None
    try:
        return FlowEngine.from_row(dict(row))
    except Exception:
        return None


def _notify_sector_attendants(contact_name: str, contact_phone: str, sector: dict) -> None:
    with get_conn() as conn:
        attendants = conn.execute(
            "SELECT * FROM attendants WHERE sector_id=? AND active=1 AND whatsapp_number != ''",
            (sector["id"],),
        ).fetchall()
    for att in attendants:
        wa.send_attendant_notification(
            att["whatsapp_number"], contact_name, contact_phone, sector["name"]
        )


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

    _INSTITUTION_MAP = {"1": "crianca", "2": "mae"}

    with get_conn() as conn:
        # Busca conversa aberta para este contato
        conv = conn.execute(
            "SELECT * FROM conversations WHERE contact_phone=? AND status NOT IN ('closed') "
            "ORDER BY id DESC LIMIT 1",
            (phone,),
        ).fetchone()

        engine = _load_flow_engine(conn)
        flow_ctx = {"contact_name": contact_name, "contact_phone": phone}

        # Palavra-chave para reiniciar — volta ao menu de instituição
        if text.lower() in ("menu", "inicio", "início", "0", "voltar"):
            if conv:
                conn.execute(
                    "UPDATE conversations SET status='pending_institution', institution='', "
                    "sector_id=NULL, updated_at=datetime('now','localtime') WHERE id=?",
                    (conv["id"],),
                )
            else:
                conv_id = conn.execute(
                    "INSERT INTO conversations (contact_phone, contact_name, status) VALUES (?,?,?)",
                    (phone, contact_name, "pending_institution"),
                ).lastrowid
                conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
            inst_msg = engine and engine.content("msg-inst", flow_ctx)
            if inst_msg:
                wa.send_text(phone, inst_msg)
            else:
                wa.send_institution_menu(phone, contact_name)
            return {"action": "institution_menu_sent"}

        # Sem conversa aberta → verificar horário antes de criar
        if not conv:
            if not _is_business_hours(runtime):
                start = runtime.get("business_hours_start", "08:00")
                end = runtime.get("business_hours_end", "18:00")
                days = _format_business_days(runtime.get("business_days", "0,1,2,3,4"))
                off_msg = engine and engine.content("msg-off", {
                    **flow_ctx, "start": start, "end": end, "days": days,
                })
                if off_msg:
                    wa.send_text(phone, off_msg)
                else:
                    wa.send_off_hours(phone, start, end, days)
                return {"action": "off_hours"}
            conv_id = conn.execute(
                "INSERT INTO conversations (contact_phone, contact_name, status) VALUES (?,?,?)",
                (phone, contact_name, "pending_institution"),
            ).lastrowid
            conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
            inst_msg = engine and engine.content("msg-inst", flow_ctx)
            if inst_msg:
                wa.send_text(phone, inst_msg)
            else:
                wa.send_institution_menu(phone, contact_name)
            return {"action": "institution_menu_sent"}

        # Aguardando escolha de instituição
        if conv["status"] == "pending_institution":
            institution = _INSTITUTION_MAP.get(text.strip())
            if institution:
                sectors = [dict(r) for r in conn.execute(
                    "SELECT * FROM sectors WHERE active=1 AND institution=? ORDER BY menu_order",
                    (institution,),
                ).fetchall()]
                if not sectors:
                    wa.send_text(
                        phone,
                        "⚠️ No momento não há setores disponíveis para esta instituição. "
                        "Por favor, tente novamente mais tarde.",
                    )
                    return {"action": "no_sectors"}
                conn.execute(
                    "UPDATE conversations SET institution=?, status='pending_menu', "
                    "updated_at=datetime('now','localtime') WHERE id=?",
                    (institution, conv["id"]),
                )
                wa.send_menu(phone, institution, sectors)
                return {"action": "menu_sent", "institution": institution}
            wa.send_invalid_institution(phone)
            return {"action": "invalid_institution"}

        # Aguardando escolha de setor
        if conv["status"] == "pending_menu":
            institution = conv["institution"] or "crianca"
            sectors = [dict(r) for r in conn.execute(
                "SELECT * FROM sectors WHERE active=1 AND institution=? ORDER BY menu_order",
                (institution,),
            ).fetchall()]

            chosen = None
            if text.isdigit():
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
                # C: posição na fila
                position = conn.execute(
                    "SELECT COUNT(*) FROM conversations WHERE sector_id=? AND status='waiting'",
                    (chosen["id"],),
                ).fetchone()[0]
                wa.send_sector_confirmation(phone, chosen["name"])
                wa.send_queue_position(phone, position, chosen["name"])
                # D: notifica atendentes do setor
                _notify_sector_attendants(conv["contact_name"] or phone, phone, chosen)
                return {"action": "sector_assigned", "sector": chosen["name"]}

            if not sectors:
                wa.send_text(
                    phone,
                    "⚠️ No momento não há setores disponíveis. Por favor, tente mais tarde.",
                )
                return {"action": "no_sectors"}

            wa.send_invalid_sector_with_menu(phone, sectors)
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

        # B: aguardando avaliação CSAT
        if conv["status"] == "pending_close":
            rating = int(text.strip()) if text.strip() in ("1", "2", "3", "4") else None
            conn.execute(
                "UPDATE conversations SET status='closed', csat_rating=?, "
                "updated_at=datetime('now','localtime') WHERE id=?",
                (rating, conv["id"]),
            )
            if rating:
                wa.send_csat_thanks(phone)
            return {"action": "conversation_closed", "rating": rating}

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
            "INSERT INTO sectors (name, description, emoji, menu_order, active, institution) VALUES (?,?,?,?,?,?)",
            (body.name, body.description, body.emoji, body.menu_order, int(body.active), body.institution),
        ).lastrowid
        return dict(conn.execute("SELECT * FROM sectors WHERE id=?", (row_id,)).fetchone())


@router.put("/sectors/{sector_id}")
def update_sector(sector_id: int, body: SectorBody, _: Auth):
    with get_conn() as conn:
        conn.execute(
            "UPDATE sectors SET name=?, description=?, emoji=?, menu_order=?, active=?, institution=? WHERE id=?",
            (body.name, body.description, body.emoji, body.menu_order, int(body.active), body.institution, sector_id),
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
        "SELECT c.*, s.name AS sector_name, s.emoji AS sector_emoji, s.institution AS sector_institution, "
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
            "SELECT c.*, s.name AS sector_name, s.emoji AS sector_emoji, s.institution AS sector_institution, "
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
        conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        conn.execute(
            "UPDATE conversations SET status='pending_close', "
            "updated_at=datetime('now','localtime') WHERE id=?",
            (conv_id,),
        )
    wa.send_close_confirmation(conv["contact_phone"])
    return {"success": True}


@router.post("/conversations/{conv_id}/transfer")
def transfer_conversation(conv_id: int, body: TransferBody, _: Auth):
    with get_conn() as conn:
        conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        sector = conn.execute(
            "SELECT * FROM sectors WHERE id=? AND active=1", (body.sector_id,)
        ).fetchone()
        if not sector:
            raise HTTPException(status_code=404, detail="Setor não encontrado ou inativo")
        conn.execute(
            "INSERT INTO conversation_transfers "
            "(conversation_id, from_sector_id, to_sector_id, from_attendant_id) VALUES (?,?,?,?)",
            (conv_id, conv["sector_id"], body.sector_id, conv["attendant_id"]),
        )
        conn.execute(
            "UPDATE conversations SET sector_id=?, attendant_id=NULL, status='waiting', "
            "updated_at=datetime('now','localtime') WHERE id=?",
            (body.sector_id, conv_id),
        )
    sector = dict(sector)
    wa.send_transfer_notification(conv["contact_phone"], sector["name"])
    _notify_sector_attendants(conv["contact_name"] or conv["contact_phone"], conv["contact_phone"], sector)
    return {"success": True, "sector": sector}


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
            "SELECT s.name, s.emoji, s.institution, COUNT(c.id) AS total, "
            "SUM(CASE WHEN c.status='waiting' THEN 1 ELSE 0 END) AS waiting "
            "FROM sectors s LEFT JOIN conversations c ON c.sector_id=s.id AND c.status!='closed' "
            "GROUP BY s.id ORDER BY s.institution, s.menu_order"
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


# ── Flow ──────────────────────────────────────────────────────────────────────

@router.get("/flow")
def get_flow():
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM flows WHERE active=1 ORDER BY updated_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["nodes"] = json.loads(result["nodes"]) if isinstance(result["nodes"], str) else result["nodes"]
        result["edges"] = json.loads(result["edges"]) if isinstance(result["edges"], str) else result["edges"]
        return result


@router.post("/flow", status_code=201)
def save_flow(body: FlowBody, _: Auth):
    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM flows WHERE active=1 LIMIT 1").fetchone()
        nodes_json = json.dumps(body.nodes)
        edges_json = json.dumps(body.edges)
        if existing:
            conn.execute(
                "UPDATE flows SET name=?, nodes=?, edges=?, updated_at=datetime('now','localtime') WHERE id=?",
                (body.name, nodes_json, edges_json, existing["id"]),
            )
            row = conn.execute("SELECT * FROM flows WHERE id=?", (existing["id"],)).fetchone()
        else:
            row_id = conn.execute(
                "INSERT INTO flows (name, nodes, edges) VALUES (?,?,?)",
                (body.name, nodes_json, edges_json),
            ).lastrowid
            row = conn.execute("SELECT * FROM flows WHERE id=?", (row_id,)).fetchone()
        result = dict(row)
        result["nodes"] = json.loads(result["nodes"])
        result["edges"] = json.loads(result["edges"])
        return result
