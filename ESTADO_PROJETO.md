# Estado do Projeto — Casa da Criança Batuira Bot
> Atualizado em: 2026-06-15

---

## O que é

Painel web de atendimento WhatsApp para **Casa da Criança Batuira** e **Casa da Mãe Batuira**.  
Mensagens chegam no número central e são roteadas para os setores corretos via bot automático.

**Stack:** FastAPI (Python 3.13) + Next.js 14 + Evolution API + SQLite + Supabase Auth

---

## Como subir

### Backend
```bash
cd prototipo/backend
source venv/bin/activate
python -m uvicorn main:app --reload --port 8000
```
Ou usar o arquivo `iniciar.bat` na raiz (Windows).

### Frontend
```bash
cd prototipo/frontend
npm run dev
```
Abre em `http://localhost:3001` (ou 3000 se disponível).

---

## Funcionalidades implementadas

### Fluxo WhatsApp (bot automático)
1. Novo contato → bot pergunta qual instituição (1=Criança / 2=Mãe)
2. Escolha da instituição → bot exibe menu de setores
3. Escolha do setor → conversa entra na fila `waiting`
4. Atendente assume pelo painel → `active`
5. Palavras "menu / 0 / voltar / inicio" reiniciam do passo 1

### Painel de Atendimento (`/atendimento`)
- **TopNav** — nome do atendente logado, badge de conversas aguardando, toggle de som, dropdown (Configurações | Sair)
- **Lista plana** — ordenada por urgência: Aguardando → Novo → Triagem → Em atendimento → Encerradas
- **Badge de atendente** — mostra `→ Amanda` quando a conversa está sendo atendida
- **Painel de contato** (direita, colapsável):
  - Apelido editável para o contato (salva no banco ao sair do campo)
  - Notas internas do contato (visíveis só para atendentes)
  - Histórico de atendimentos anteriores do mesmo número
- **Respostas rápidas** — botão ⚡ ou digitando `/` no chat abre picker com busca
- **Som de notificação** — toca ao chegar mensagem não lida (toggle persistido no navegador)
- **Transferência de setor** — dropdown no cabeçalho do chat
- **Indicador de urgência** — badge vermelho se aguardando > 10 min

### Configurações (`/configuracoes`)
- **Setores** — CRUD do menu WhatsApp
- **Atendentes** — CRUD com campo Supabase User ID para login individual
- **Acesso à API** — geração de API keys
- **Respostas Rápidas** — CRUD de atalhos de texto (`/saudacao`, `/encerrar`, etc.)
- **Horário de atendimento** — início/fim + dias da semana + mensagem fora do horário
- **Parear WhatsApp** — QR Code da instância Evolution API

---

## Banco de dados (SQLite)

Arquivo: `prototipo/backend/data/batuira.db`

| Tabela | Descrição |
|---|---|
| `sectors` | Setores com campo `institution` (crianca/mae) |
| `attendants` | Atendentes com `supabase_user_id` para login |
| `conversations` | Conversas com status e instituição |
| `messages` | Mensagens in/out |
| `contacts` | Apelido e notas internas por telefone |
| `quick_replies` | Respostas rápidas com atalho `/shortcut` |
| `conversation_transfers` | Histórico de transferências |
| `api_keys` | Chaves de acesso externo |

---

## Autenticação

Atualmente **DESATIVADA** para testes (`AuthGuard` em modo bypass).

Para reativar: editar `prototipo/frontend/components/AuthGuard.tsx` e restaurar a verificação via Supabase.

Para vincular atendentes ao login: em Configurações → Atendentes, preencher o campo **Supabase User ID** com o UUID do usuário criado no painel Supabase (`Authentication → Users`).

---

## Variáveis de ambiente

### Backend (`prototipo/backend/.env`)
```
EVOLUTION_API_KEY=...
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_INSTANCE=batuira
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_JWT_SECRET=...
```

### Frontend (`prototipo/frontend/.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Pendências

- [ ] Reativar autenticação quando pronto para uso real
- [ ] Vincular cada atendente ao Supabase User ID
- [ ] Deploy no Oracle Cloud (ver `DEPLOY/` para scripts prontos)

---

## Estrutura de arquivos relevante

```
prototipo/
├── backend/
│   ├── main.py                  # FastAPI app + manutenção automática
│   ├── database.py              # SQLite DDL + migrações
│   ├── api/routes.py            # Todos os endpoints REST
│   ├── agents/whatsapp_agent.py # Mensagens enviadas pelo bot
│   └── utils/
│       ├── auth.py              # Supabase JWT + API Keys
│       └── settings_store.py    # Configurações persistidas em JSON
└── frontend/
    ├── app/
    │   ├── page.tsx                          # Dashboard
    │   ├── atendimento/page.tsx              # Painel de atendimento
    │   ├── configuracoes/
    │   │   ├── page.tsx                      # Hub de configurações
    │   │   ├── setores/page.tsx
    │   │   ├── atendentes/page.tsx
    │   │   ├── api/page.tsx
    │   │   └── respostas-rapidas/page.tsx    # CRUD respostas rápidas
    │   └── login/page.tsx
    ├── components/
    │   ├── AuthGuard.tsx         # Guard de autenticação (bypass ativo)
    │   └── ConfirmDialog.tsx
    ├── lib/
    │   ├── api.ts                # Funções e tipos da API REST
    │   ├── attendantContext.tsx  # Contexto do atendente logado
    │   └── supabase.ts           # Cliente Supabase
    └── public/
        └── notification.wav     # Som de notificação (beep 880Hz)
```
