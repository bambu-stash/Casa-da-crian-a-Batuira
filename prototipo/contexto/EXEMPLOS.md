# Exemplos Práticos — Tarefas Comuns

> Copie e adapte. Cada exemplo é autocontido.

---

## Adicionar uma mensagem automática ao encerrar conversa

Em `backend/api/routes.py`, na função `close_conversation`:

```python
@router.post("/conversations/{conv_id}/close")
def close_conversation(conv_id: int, _: Auth):
    with get_conn() as conn:
        conv = conn.execute("SELECT * FROM conversations WHERE id=?", (conv_id,)).fetchone()
        conn.execute(
            "UPDATE conversations SET status='closed', updated_at=datetime('now','localtime') WHERE id=?",
            (conv_id,),
        )
        # Adicione isto:
        if conv:
            wa.send_text(
                conv["contact_phone"],
                "Seu atendimento foi encerrado. Obrigado por entrar em contato! 😊\n\nDigite *menu* para falar conosco novamente."
            )
    return {"success": True}
```

---

## Adicionar um 5º setor (ex: Saúde)

**Via painel:** Configurações → Setores → Novo Setor  
- Nome: Saúde
- Emoji: 🏥
- Ordem: 5

**Via banco (direto):**
```sql
INSERT INTO sectors (name, description, emoji, menu_order, active)
VALUES ('Saúde', 'Consultas e acompanhamento médico', '🏥', 5, 1);
```

O menu do WhatsApp atualiza automaticamente na próxima mensagem recebida.

---

## Criar um endpoint novo (ex: relatório de atendimentos do dia)

Em `backend/api/routes.py`:

```python
@router.get("/reports/today")
def report_today(_: Auth):
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT s.name, COUNT(c.id) as total,
                   SUM(CASE WHEN c.status='closed' THEN 1 ELSE 0 END) as fechados
            FROM conversations c
            JOIN sectors s ON c.sector_id = s.id
            WHERE date(c.created_at) = date('now','localtime')
            GROUP BY s.id
        """).fetchall()
        return [dict(r) for r in rows]
```

Em `frontend/lib/api.ts`:

```typescript
export const getReportToday = () => get<{name: string; total: number; fechados: number}[]>("/reports/today");
```

---

## Enviar mensagem proativa para um contato

```python
from agents.whatsapp_agent import WhatsAppAgent
wa = WhatsAppAgent()
wa.send_text("5511999990001", "Olá! Lembrete: sua reunião é amanhã às 10h.")
```

---

## Verificar autenticação numa rota nova

```python
# Rota pública (sem auth)
@router.get("/public-info")
def public_info():
    return {"msg": "qualquer um pode ver"}

# Rota protegida (exige login)
@router.get("/private-info")
def private_info(_: Auth):
    return {"msg": "só atendentes logados veem"}

# Rota que usa o usuário logado
@router.get("/my-info")
def my_info(user: Auth):
    return {"email": user.get("email"), "type": user.get("type")}
```

---

## Criar nova página protegida no frontend

```tsx
// frontend/app/minha-pagina/page.tsx
"use client";
import AuthGuard from "@/components/AuthGuard";

export default function MinhaPagina() {
  return (
    <AuthGuard>
      <main className="min-h-screen bg-gray-50 p-6">
        <h1>Minha página</h1>
      </main>
    </AuthGuard>
  );
}
```

---

## Filtrar conversas por setor no painel

```typescript
// frontend/lib/api.ts — já existe, só use:
const convs = await getConversations({ status: "waiting", sector_id: 1 });
```

---

## Resetar o banco (apagar tudo e recomeçar)

```bash
rm backend/data/batuira.db
# reinicie o backend — o banco é recriado com os 4 setores padrão
```

---

## Testar o webhook manualmente (simular mensagem WhatsApp)

```bash
curl -X POST http://localhost:8000/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "instance": "batuira",
    "data": {
      "key": {"remoteJid": "5511999990099@s.whatsapp.net", "fromMe": false, "id": "test1"},
      "pushName": "Teste",
      "message": {"conversation": "oi"}
    }
  }'
```
