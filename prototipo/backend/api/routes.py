"""
Rotas da API — Casa da Criança Batuira Bot.
"""
import hashlib
import secrets
from datetime import datetime
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from agents.whatsapp_agent import WhatsAppAgent
from config import settings
from database import get_conn
from utils.auth import require_auth, create_local_token
from utils.api_keys import get_evolution_key, get_evolution_url, get_evolution_instance
from utils.settings_store import get_settings, update_settings

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
    role: str = ""
    avatar_url: str = ""
    bio: str = ""


class ReplyBody(BaseModel):
    text: str


class TransferBody(BaseModel):
    sector_id: int


class ApiKeyBody(BaseModel):
    name: str
    user_email: str


class ContactPatch(BaseModel):
    name_override: str | None = None
    notes: str | None = None


class QuickReplyBody(BaseModel):
    title: str
    content: str
    shortcut: str = ""
    active: bool = True


class RegisterBody(BaseModel):
    name: str
    email: str
    password: str
    sector_id: int


class LoginBody(BaseModel):
    email: str
    password: str


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
    return {
        "status": "ok",
        "services": {
            "evolution_api": "configured" if evolution_ok else "missing_key",
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


def _assign_sector(conn, conv: dict, sector: dict, phone: str) -> None:
    conn.execute(
        "UPDATE conversations SET sector_id=?, institution=?, status='waiting', "
        "updated_at=datetime('now','localtime') WHERE id=?",
        (sector["id"], sector.get("institution", ""), conv["id"]),
    )
    position = conn.execute(
        "SELECT COUNT(*) FROM conversations WHERE sector_id=? AND status='waiting'",
        (sector["id"],),
    ).fetchone()[0]
    wa.send_sector_confirmation(phone, sector["name"])
    wa.send_queue_position(phone, position, sector["name"])
    _notify_sector_attendants(conv["contact_name"] or phone, phone, sector)


# ── WhatsApp Webhook ──────────────────────────────────────────────────────────

_RESET_KEYWORDS = {"menu", "inicio", "início", "0", "voltar"}
_INSTITUTION_MAP = {"1": "crianca", "2": "mae"}


@router.post("/whatsapp/webhook")
def whatsapp_webhook(payload: WebhookPayload):
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
        conv_row = conn.execute(
            "SELECT * FROM conversations WHERE contact_phone=? AND status NOT IN ('closed') "
            "ORDER BY id DESC LIMIT 1",
            (phone,),
        ).fetchone()
        conv = dict(conv_row) if conv_row else None

        # Conversa em espera pelo atendente ou com atendente — só salvar mensagem
        if conv and conv["status"] in ("waiting", "active"):
            conn.execute(
                "INSERT INTO messages (conversation_id, content, direction) VALUES (?,?,?)",
                (conv["id"], text, "in"),
            )
            conn.execute(
                "UPDATE conversations SET updated_at=datetime('now','localtime') WHERE id=?",
                (conv["id"],),
            )
            return {"action": "message_stored"}

        # Palavra-chave de reinício
        if text.lower() in _RESET_KEYWORDS:
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
                conv = dict(conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone())
            wa.send_institution_menu(phone, contact_name)
            return {"action": "institution_menu_sent"}

        # Nova conversa
        if not conv:
            if not _is_business_hours(runtime):
                start_h = runtime.get("business_hours_start", "08:00")
                end_h = runtime.get("business_hours_end", "18:00")
                days = _format_business_days(runtime.get("business_days", "0,1,2,3,4"))
                off_msg = runtime.get("off_hours_message", "")
                if off_msg:
                    wa.send_text(phone, off_msg)
                else:
                    wa.send_off_hours(phone, start_h, end_h, days)
                return {"action": "off_hours"}
            conv_id = conn.execute(
                "INSERT INTO conversations (contact_phone, contact_name, status) VALUES (?,?,?)",
                (phone, contact_name, "pending_institution"),
            ).lastrowid
            conv = dict(conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone())
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
                    wa.send_text(phone, "⚠️ No momento não há setores disponíveis. Tente mais tarde.")
                    return {"action": "no_sectors"}
                conn.execute(
                    "UPDATE conversations SET institution=?, status='pending_menu', "
                    "updated_at=datetime('now','localtime') WHERE id=?",
                    (institution, conv["id"]),
                )
                wa.send_menu(phone, institution, sectors)
                return {"action": "menu_sent"}
            wa.send_invalid_institution(phone)
            return {"action": "invalid_institution"}

        # Aguardando escolha de setor
        if conv["status"] == "pending_menu":
            institution = conv["institution"] or "crianca"
            sectors = [dict(r) for r in conn.execute(
                "SELECT * FROM sectors WHERE active=1 AND institution=? ORDER BY menu_order",
                (institution,),
            ).fetchall()]
            chosen = next((s for s in sectors if text.isdigit() and s["menu_order"] == int(text)), None)
            if chosen:
                conn.execute(
                    "INSERT INTO messages (conversation_id, content, direction) VALUES (?,?,?)",
                    (conv["id"], text, "in"),
                )
                _assign_sector(conn, conv, chosen, phone)
                return {"action": "sector_assigned", "sector": chosen["name"]}
            wa.send_invalid_sector_with_menu(phone, sectors)
            return {"action": "invalid_option"}

    return {"ignored": True}


# ── Setores ───────────────────────────────────────────────────────────────────

@router.get("/sectors")
def list_sectors():
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM sectors ORDER BY institution, menu_order").fetchall()
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
            "INSERT INTO attendants (name, sector_id, whatsapp_number, email, supabase_user_id, active, role, avatar_url, bio) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (body.name, body.sector_id, body.whatsapp_number, body.email,
             body.supabase_user_id, int(body.active), body.role, body.avatar_url, body.bio),
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
            "supabase_user_id=?, active=?, role=?, avatar_url=?, bio=? WHERE id=?",
            (body.name, body.sector_id, body.whatsapp_number, body.email,
             body.supabase_user_id, int(body.active), body.role, body.avatar_url, body.bio,
             attendant_id),
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
        "a.name AS attendant_name, ct.name_override AS contact_name_override, "
        "(SELECT content FROM messages m1 WHERE m1.conversation_id=c.id "
        " AND m1.direction='in' ORDER BY m1.id DESC LIMIT 1) AS last_message, "
        "(SELECT COUNT(*) FROM messages m2 WHERE m2.conversation_id=c.id "
        " AND m2.direction='in' AND m2.id > COALESCE("
        "   (SELECT id FROM messages m3 WHERE m3.conversation_id=c.id "
        "    AND m3.direction='out' ORDER BY m3.id DESC LIMIT 1), 0)) AS unread_count "
        "FROM conversations c "
        "LEFT JOIN sectors s ON c.sector_id = s.id "
        "LEFT JOIN attendants a ON c.attendant_id = a.id "
        "LEFT JOIN contacts ct ON c.contact_phone = ct.phone "
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
            "UPDATE conversations SET status='closed', "
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


# ── Me (perfil do atendente logado) ──────────────────────────────────────────

@router.get("/me")
def get_me(auth: Auth):
    with get_conn() as conn:
        # Token local: usa attendant_id direto
        att_id = auth.get("attendant_id")
        if att_id:
            row = conn.execute(
                "SELECT a.*, s.name AS sector_name FROM attendants a "
                "LEFT JOIN sectors s ON a.sector_id=s.id "
                "WHERE a.id=? AND a.active=1 LIMIT 1",
                (att_id,),
            ).fetchone()
            return dict(row) if row else None

        # Token Supabase: usa sub (UUID)
        sub = auth.get("sub", "")
        if not sub:
            return None
        row = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id "
            "WHERE a.supabase_user_id=? AND a.active=1 LIMIT 1",
            (sub,),
        ).fetchone()
        return dict(row) if row else None


# ── Register (cadastro de novo atendente) ─────────────────────────────────────

@router.post("/register", status_code=201)
def register(body: RegisterBody):
    import bcrypt

    supabase_user_id = ""

    if settings.supabase_url and settings.supabase_service_key:
        resp = httpx.post(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "application/json",
            },
            json={"email": body.email, "password": body.password, "email_confirm": True},
            timeout=10,
        )
        if resp.status_code == 422:
            raise HTTPException(status_code=409, detail=resp.json().get("msg", "E-mail já cadastrado."))
        if not resp.is_success:
            raise HTTPException(status_code=502, detail="Falha ao criar usuário no Supabase.")
        supabase_user_id = resp.json().get("id", "")

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()

    with get_conn() as conn:
        existing = conn.execute("SELECT id FROM attendants WHERE email=?", (body.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="E-mail já cadastrado como atendente.")

        row_id = conn.execute(
            "INSERT INTO attendants (name, sector_id, email, supabase_user_id, password_hash, active) "
            "VALUES (?,?,?,?,?,1)",
            (body.name, body.sector_id, body.email, supabase_user_id, password_hash),
        ).lastrowid
        row = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id WHERE a.id=?",
            (row_id,),
        ).fetchone()
        return dict(row)


@router.post("/login")
def login(body: LoginBody):
    import bcrypt

    with get_conn() as conn:
        row = conn.execute(
            "SELECT a.*, s.name AS sector_name FROM attendants a "
            "LEFT JOIN sectors s ON a.sector_id=s.id "
            "WHERE a.email=? AND a.active=1 LIMIT 1",
            (body.email,),
        ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    att = dict(row)
    pwd_hash = att.get("password_hash", "")

    if not pwd_hash:
        raise HTTPException(status_code=401, detail="Conta sem senha configurada. Recadastre-se.")

    if not bcrypt.checkpw(body.password.encode(), pwd_hash.encode()):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    token = create_local_token(att["id"], att["email"])
    return {"access_token": token, "token_type": "bearer", "attendant": att}


# ── Contacts ──────────────────────────────────────────────────────────────────

@router.get("/contacts/{phone}")
def get_contact(phone: str, _: Auth):
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM contacts WHERE phone=?", (phone,)).fetchone()
        if not row:
            return {"phone": phone, "name_override": "", "notes": ""}
        return dict(row)


@router.patch("/contacts/{phone}")
def patch_contact(phone: str, body: ContactPatch, _: Auth):
    sets = []
    vals: list = []
    if body.name_override is not None:
        sets.append("name_override=?")
        vals.append(body.name_override)
    if body.notes is not None:
        sets.append("notes=?")
        vals.append(body.notes)
    if not sets:
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM contacts WHERE phone=?", (phone,)).fetchone()
            return dict(row) if row else {"phone": phone, "name_override": "", "notes": ""}
    sets.append("updated_at=datetime('now','localtime')")
    name_ins = body.name_override if body.name_override is not None else ""
    notes_ins = body.notes if body.notes is not None else ""
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO contacts (phone, name_override, notes) VALUES (?, ?, ?) "
            f"ON CONFLICT(phone) DO UPDATE SET {', '.join(sets)}",
            [phone, name_ins, notes_ins] + vals,
        )
        row = conn.execute("SELECT * FROM contacts WHERE phone=?", (phone,)).fetchone()
        return dict(row)


@router.get("/contacts/{phone}/history")
def contact_history(phone: str, _: Auth):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT c.*, s.name AS sector_name, s.emoji AS sector_emoji, "
            "a.name AS attendant_name FROM conversations c "
            "LEFT JOIN sectors s ON c.sector_id=s.id "
            "LEFT JOIN attendants a ON c.attendant_id=a.id "
            "WHERE c.contact_phone=? AND c.status='closed' "
            "ORDER BY c.created_at DESC LIMIT 20",
            (phone,),
        ).fetchall()
        return [dict(r) for r in rows]


# ── Quick Replies ─────────────────────────────────────────────────────────────

@router.get("/quick-replies")
def list_quick_replies(_: Auth):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM quick_replies WHERE active=1 ORDER BY title"
        ).fetchall()
        return [dict(r) for r in rows]


@router.post("/quick-replies", status_code=201)
def create_quick_reply(body: QuickReplyBody, _: Auth):
    with get_conn() as conn:
        row_id = conn.execute(
            "INSERT INTO quick_replies (title, content, shortcut, active) VALUES (?,?,?,?)",
            (body.title, body.content, body.shortcut, int(body.active)),
        ).lastrowid
        return dict(conn.execute("SELECT * FROM quick_replies WHERE id=?", (row_id,)).fetchone())


@router.put("/quick-replies/{qr_id}")
def update_quick_reply(qr_id: int, body: QuickReplyBody, _: Auth):
    with get_conn() as conn:
        conn.execute(
            "UPDATE quick_replies SET title=?, content=?, shortcut=?, active=? WHERE id=?",
            (body.title, body.content, body.shortcut, int(body.active), qr_id),
        )
        row = conn.execute("SELECT * FROM quick_replies WHERE id=?", (qr_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Resposta rápida não encontrada")
        return dict(row)


@router.delete("/quick-replies/{qr_id}", status_code=204)
def delete_quick_reply(qr_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute("DELETE FROM quick_replies WHERE id=?", (qr_id,))


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
        result["key"] = raw
        return result


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_api_key(key_id: int, _: Auth):
    with get_conn() as conn:
        conn.execute("UPDATE api_keys SET active=0 WHERE id=?", (key_id,))
