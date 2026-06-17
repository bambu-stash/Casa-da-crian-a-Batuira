import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db, get_conn
from api.routes import router
from agents.whatsapp_agent import WhatsAppAgent
from utils.settings_store import get_settings

_wa = WhatsAppAgent()


def _run_maintenance() -> None:
    runtime = get_settings()
    timeout_hours = int(runtime.get("conversation_timeout_hours", 24))
    cutoff = (datetime.now() - timedelta(hours=timeout_hours)).strftime("%Y-%m-%d %H:%M:%S")
    retention_cutoff = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        # Fecha conversas em espera com tempo esgotado
        stale = conn.execute(
            "SELECT * FROM conversations WHERE status='waiting' AND updated_at < ?",
            (cutoff,),
        ).fetchall()
        for conv in stale:
            conn.execute(
                "UPDATE conversations SET status='closed', "
                "updated_at=datetime('now','localtime') WHERE id=?",
                (conv["id"],),
            )
            _wa.send_timeout(conv["contact_phone"])

        # Apaga mensagens e conversas fechadas com mais de 6 meses
        old_convs = conn.execute(
            "SELECT id FROM conversations WHERE status='closed' AND updated_at < ?",
            (retention_cutoff,),
        ).fetchall()
        for conv in old_convs:
            conn.execute("DELETE FROM messages WHERE conversation_id=?", (conv["id"],))
        if old_convs:
            conn.execute(
                "DELETE FROM conversations WHERE status='closed' AND updated_at < ?",
                (retention_cutoff,),
            )


async def _maintenance_loop() -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            _run_maintenance()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_maintenance_loop())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Batuira Bot", version="2.0.0", lifespan=lifespan)

_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
_origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
