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


def _run_timeout_check() -> None:
    runtime = get_settings()
    timeout_hours = int(runtime.get("conversation_timeout_hours", 24))
    cutoff = (datetime.now() - timedelta(hours=timeout_hours)).strftime("%Y-%m-%d %H:%M:%S")
    close_cutoff = (datetime.now() - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M:%S")

    with get_conn() as conn:
        # A: fecha conversas em espera com tempo esgotado
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

        # Fecha pending_close sem resposta após 2 horas (sem CSAT)
        conn.execute(
            "UPDATE conversations SET status='closed', "
            "updated_at=datetime('now','localtime') "
            "WHERE status='pending_close' AND updated_at < ?",
            (close_cutoff,),
        )


async def _timeout_checker() -> None:
    while True:
        await asyncio.sleep(3600)
        try:
            _run_timeout_check()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(_timeout_checker())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Batuira Bot", version="1.0.0", lifespan=lifespan)

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
