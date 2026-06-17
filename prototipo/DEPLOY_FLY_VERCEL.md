# Guia de Deploy — Fly.io (backend) + Vercel (frontend)

Este guia descreve o deploy do Batuira Bot na estratégia **Fly.io + Vercel**.

- **Backend** (FastAPI + SQLite) → Fly.io, com volume persistente para o banco
- **Frontend** (Next.js) → Vercel
- **Evolution API** → serviço externo (você fornece URL + API key)
- **Autenticação** → Supabase (já configurado)

> **Ordem importante:** suba o backend primeiro (para obter a URL `*.fly.dev`),
> depois o frontend, e por fim religue o CORS com a URL real da Vercel.

---

## Pré-requisitos

- Conta no [Fly.io](https://fly.io) + CLI `flyctl` instalado (`curl -L https://fly.io/install.sh | sh`)
- Conta na [Vercel](https://vercel.com) (deploy via importação do repositório GitHub)
- Projeto Supabase ativo (URL, anon key e service_role key)
- Evolution API acessível (URL pública + API key + nome da instância)

Antes de tudo, valide o build do frontend localmente:

```bash
cd prototipo/frontend
npm install
npm run build   # deve concluir sem erros
```

---

## A. Backend no Fly.io

```bash
cd prototipo/backend

# 1. Autenticar
fly auth login

# 2. Provisionar o app reusando o fly.toml (NÃO faz deploy ainda)
fly launch --no-deploy
#   - Confirme o nome do app (ex.: casa-da-crian-a-batuira) e a região gru (São Paulo)
#   - Se perguntar sobre sobrescrever o fly.toml, responda NÃO

# 3. Criar o volume do SQLite (uma única vez)
fly volumes create batuira_data --region gru --size 1

# 4. Definir os secrets (substitua os valores reais)
fly secrets set \
  EVOLUTION_API_URL="https://sua-evolution-api.com" \
  EVOLUTION_API_KEY="sua-chave-evolution" \
  EVOLUTION_INSTANCE="batuira" \
  SUPABASE_URL="https://muxpbrfojzalthrecxrb.supabase.co" \
  SUPABASE_SERVICE_KEY="sua-service-role-key" \
  LOCAL_SECRET="$(openssl rand -hex 32)" \
  ALLOWED_ORIGINS="https://SEU-APP.vercel.app"

# 5. Deploy
fly deploy

# 6. Verificar saúde
curl https://casa-da-crian-a-batuira.fly.dev/api/health
#   esperado: {"status":"ok","services":{"evolution_api":"configured"}}
```

**Notas:**
- O banco SQLite vive em `/app/data/batuira.db`, montado no volume `batuira_data` → **persiste entre deploys**.
- O `init_db()` roda no startup: cria as tabelas e popula os setores padrão automaticamente.
- `LOCAL_SECRET` deve ser **fixo**. Sem ele, os tokens de login local expiram a cada restart.
- `SUPABASE_JWT_SECRET` **não é necessário** — a verificação de tokens Supabase usa JWKS (chave pública).

---

## B. Frontend na Vercel

1. Na Vercel, **Add New → Project** e importe o repositório do GitHub.
2. Em **Root Directory**, selecione `prototipo/frontend`.
3. Framework: **Next.js** (detectado automaticamente).
4. Em **Settings → Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://casa-da-crian-a-batuira.fly.dev/api` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://muxpbrfojzalthrecxrb.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` (anon key do Supabase) |

5. **Deploy**. Ao final, anote a URL gerada (ex.: `https://batuira-xxx.vercel.app`).

---

## C. Religar CORS + Webhook

```bash
# 1. Atualizar o backend com a URL REAL da Vercel
cd prototipo/backend
fly secrets set ALLOWED_ORIGINS="https://batuira-xxx.vercel.app"
#   (o Fly reinicia a máquina automaticamente ao mudar secrets)
```

2. Na **Evolution API**, configure o webhook global apontando para:

   ```
   https://casa-da-crian-a-batuira.fly.dev/api/whatsapp/webhook
   ```

   Habilite os eventos de mensagem (`messages.upsert`).

---

## Verificação end-to-end

1. **Backend:** `curl https://casa-da-crian-a-batuira.fly.dev/api/health` → `{"status":"ok",...}`
2. **Painel:** abra a URL da Vercel → tela de login → autentique via Supabase.
3. **CORS:** confirme que setores e conversas carregam sem erro de CORS no console do navegador.
4. **Webhook:** envie uma mensagem ao número do WhatsApp → a conversa deve aparecer no painel.

---

## Solução de problemas

| Sintoma | Causa provável | Correção |
|---|---|---|
| Erro de CORS no console | `ALLOWED_ORIGINS` não bate com a URL da Vercel | `fly secrets set ALLOWED_ORIGINS=<url-exata>` |
| Login local "desloga" após um tempo | `LOCAL_SECRET` não definido ou mudou | definir `LOCAL_SECRET` fixo nos secrets |
| `/health` mostra `missing_key` | `EVOLUTION_API_KEY` ausente | `fly secrets set EVOLUTION_API_KEY=...` |
| Webhook não chega | URL do webhook errada na Evolution API | usar `https://casa-da-crian-a-batuira.fly.dev/api/whatsapp/webhook` |
| Dados sumiram após deploy | volume não montado | conferir `[[mounts]]` no `fly.toml` e `fly volumes list` |
| Token Supabase rejeitado (401) | `SUPABASE_URL` ausente no backend | `fly secrets set SUPABASE_URL=...` |
