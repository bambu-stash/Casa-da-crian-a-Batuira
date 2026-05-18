# Batuira Bot

Bot de atendimento via WhatsApp para a **Casa da Criança Batuira**. Recebe mensagens em um único número, apresenta um menu com os setores disponíveis e direciona o contato para o atendente certo — tudo gerenciado por um painel web com login individual.

---

## Como funciona (fluxo básico)

```
Contato manda mensagem
        ↓
Bot envia menu de setores
  1️⃣ Financeiro
  2️⃣ Pedagógico
  3️⃣ Administrativo
  4️⃣ Assistência Social
        ↓
Contato escolhe (ex: "1")
        ↓
Conversa entra na fila do setor
        ↓
Atendente abre o painel → clica "Assumir"
        ↓
Bot avisa o contato: "Olá! Sou Jessica do Financeiro."
        ↓
Atendente troca mensagens pelo painel
```

---

## Arquitetura

```
prototipo/
├── backend/                        # FastAPI (Python 3.13)
│   ├── main.py                     # Ponto de entrada, inicializa banco
│   ├── config.py                   # Variáveis de ambiente (.env)
│   ├── database.py                 # SQLite — tabelas e seed inicial
│   ├── agents/
│   │   └── whatsapp_agent.py       # Envia mensagens via Evolution API
│   ├── api/
│   │   └── routes.py               # Todos os endpoints REST
│   └── utils/
│       ├── auth.py                 # Supabase JWT (ES256) + API Keys
│       ├── api_keys.py             # Lê chaves do .env ou override
│       ├── phone.py                # Sanitização de telefone
│       └── settings_store.py       # Overrides em tempo de execução
│
├── frontend/                       # Next.js 14 (TypeScript)
│   ├── app/
│   │   ├── page.tsx                # Dashboard com stats e fila por setor
│   │   ├── login/page.tsx          # Login Supabase
│   │   ├── atendimento/page.tsx    # Painel do atendente (fila + chat)
│   │   ├── flow/page.tsx           # Editor visual de fluxos
│   │   └── configuracoes/
│   │       ├── page.tsx            # Configurações gerais
│   │       ├── setores/page.tsx    # CRUD de setores do menu
│   │       ├── atendentes/page.tsx # CRUD de atendentes por setor
│   │       └── api/page.tsx        # Geração de API Keys externas
│   ├── components/
│   │   ├── AuthGuard.tsx           # Redireciona para /login se não autenticado
│   │   └── flow/                   # Nodes do editor (Message, Condition, Action, Trigger)
│   └── lib/
│       ├── supabase.ts             # Cliente Supabase + getAuthToken()
│       ├── api.ts                  # Todas as chamadas ao backend (com auth automático)
│       └── flowStore.ts            # Estado do editor (Zustand + localStorage)
│
└── README.md
```

---

## Banco de dados (SQLite)

Arquivo: `backend/data/batuira.db`

| Tabela | O que armazena |
|---|---|
| `sectors` | Setores do menu (nome, emoji, ordem) |
| `attendants` | Atendentes vinculados a um setor |
| `conversations` | Cada conversa WhatsApp (status: pending_menu / waiting / active / closed) |
| `messages` | Histórico de mensagens de cada conversa |
| `api_keys` | Chaves para integração externa (hash SHA-256) |

Seed automático: os 4 setores padrão são inseridos na primeira execução.

---

## Autenticação

- **Painel web**: login com e-mail e senha via Supabase Auth. O token JWT (ES256) é verificado no backend via JWKS (`/auth/v1/.well-known/jwks.json`).
- **Modo dev**: se `SUPABASE_URL` estiver vazio no `.env`, todas as rotas protegidas são liberadas automaticamente.
- **Integrações externas**: gere uma `API Key` em Configurações → Acesso à API. Use como `Authorization: Bearer btr_...` ou header `X-API-Key`.

---

## Endpoints principais

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/api/health` | Não | Status das integrações |
| GET/PATCH | `/api/settings` | PATCH sim | Configurações gerais |
| POST | `/api/whatsapp/webhook` | Não | Recebe mensagens da Evolution API |
| GET | `/api/sectors` | Não | Lista setores |
| POST/PUT/DELETE | `/api/sectors/{id}` | Sim | CRUD de setores |
| GET | `/api/attendants` | Não | Lista atendentes |
| POST/PUT/DELETE | `/api/attendants/{id}` | Sim | CRUD de atendentes |
| GET | `/api/conversations` | Sim | Lista conversas (filtros: status, sector_id) |
| GET | `/api/conversations/{id}/messages` | Sim | Histórico de mensagens |
| POST | `/api/conversations/{id}/assign?attendant_id=X` | Sim | Atendente assume conversa |
| POST | `/api/conversations/{id}/reply` | Sim | Atendente responde |
| POST | `/api/conversations/{id}/close` | Sim | Encerra conversa |
| GET | `/api/dashboard/stats` | Sim | Contadores por setor |
| GET/POST | `/api/api-keys` | Sim | Gerencia chaves externas |

---

## Configuração

### `backend/.env`

```env
# WhatsApp
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-chave
EVOLUTION_INSTANCE=batuira

# Claude (opcional — usado pelo chat_agent legado)
ANTHROPIC_API_KEY=sk-ant-...

# Organização
ORG_NAME=Casa da Criança Batuira
BOT_FALLBACK_PHONE=5511999990000   # alerta quando não há atendente

# Supabase (deixe vazio para modo dev sem login)
SUPABASE_URL=https://muxpbrfojzalthrecxrb.supabase.co
SUPABASE_JWT_SECRET=<jwt-secret-do-supabase>
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://muxpbrfojzalthrecxrb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

---

## Iniciar o sistema

### Windows (recomendado)
Clique duas vezes em `iniciar.bat` na raiz do projeto.

### Manual

```bash
# Terminal 1 — Backend
cd prototipo/backend
venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd prototipo/frontend
npm run dev
```

Acesse: `http://localhost:3000`

---

## Adicionar atendente novo

1. Crie o usuário no Supabase: `app.supabase.com → Authentication → Users → Add user`
2. No painel: **Configurações → Atendentes → Novo Atendente** — informe nome, setor e e-mail

---

## Configurar webhook (Evolution API)

No painel da Evolution API:
- **Settings → Webhooks → URL**: `http://SEU-IP:8000/api/whatsapp/webhook`
- Evento: `messages.upsert`

---

## Tecnologias

| Camada | Stack |
|---|---|
| Backend | Python 3.13, FastAPI, SQLite, python-jose |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand |
| Auth | Supabase Auth (ES256 JWT) |
| WhatsApp | Evolution API |
| IA (opcional) | Anthropic Claude |
