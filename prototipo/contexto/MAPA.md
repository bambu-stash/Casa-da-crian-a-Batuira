# Mapa do Projeto — Batuira Bot

> Leia este arquivo antes de fazer qualquer alteração.
> Ele explica onde fica cada coisa e como as peças se conectam.

---

## A ideia em uma frase

Um número de WhatsApp recebe todas as mensagens → bot exibe um menu → contato escolhe o setor → atendente assume pelo painel web e responde.

---

## Onde mexer para cada tarefa

### Quero mudar o texto do menu do WhatsApp
`backend/agents/whatsapp_agent.py` — variável `MENU_TEMPLATE`

### Quero adicionar ou renomear um setor
Painel web → Configurações → Setores  
OU direto no banco: `backend/data/batuira.db` tabela `sectors`

### Quero adicionar/remover um atendente
Painel web → Configurações → Atendentes  
E criar o login no Supabase: `app.supabase.com → Authentication → Users`

### Quero mudar a lógica de roteamento de mensagens
`backend/api/routes.py` — função `whatsapp_webhook`  
A máquina de estados está ali, nos blocos `if conv["status"] == ...`

### Quero adicionar um novo endpoint na API
1. Adiciona a função em `backend/api/routes.py`
2. Adiciona a chamada correspondente em `frontend/lib/api.ts`

### Quero criar uma nova página no painel
1. Cria `frontend/app/NOME_DA_PAGINA/page.tsx`
2. Envolve o conteúdo com `<AuthGuard>` para exigir login
3. Adiciona o link em `frontend/app/page.tsx` ou `configuracoes/page.tsx`

### Quero mudar como o login funciona
`frontend/lib/supabase.ts` — cliente Supabase  
`backend/utils/auth.py` — verificação do JWT no backend

### Quero gerar uma API Key para integração externa
Painel web → Configurações → Acesso à API → Gerar Nova Chave  
Use o token gerado como `Authorization: Bearer btr_...`

### Quero mudar as configurações em tempo real (sem reiniciar)
`PATCH /api/settings` ou painel → Configurações  
Os valores ficam em `backend/data/settings_override.json`

---

## Fluxo de uma mensagem (passo a passo)

```
1. Contato manda mensagem no WhatsApp
2. Evolution API faz POST em /api/whatsapp/webhook
3. routes.py verifica o status da conversa no SQLite:
   - Não existe → cria conversa + envia menu
   - pending_menu → interpreta escolha (1,2,3,4) → muda para "waiting"
   - waiting/active → salva mensagem no histórico
4. Atendente vê a fila em /atendimento
5. Atendente clica "Assumir" → POST /api/conversations/{id}/assign
6. Bot manda mensagem automática para o contato com nome do atendente
7. Atendente digita resposta no painel → POST /api/conversations/{id}/reply
8. Backend chama Evolution API para enviar a mensagem
9. Mensagem salva no histórico (direction: "out")
```

---

## Status possíveis de uma conversa

| Status | Significado |
|---|---|
| `pending_menu` | Contato mandou mensagem mas ainda não escolheu setor |
| `waiting` | Escolheu setor, aguardando atendente |
| `active` | Atendente assumiu |
| `closed` | Conversa encerrada |

Digitar **"menu"**, **"0"** ou **"voltar"** reinicia a conversa para `pending_menu`.

---

## Arquivos críticos (os que você vai abrir com mais frequência)

| Arquivo | Por quê mexer |
|---|---|
| `backend/api/routes.py` | Toda lógica de negócio e endpoints |
| `backend/agents/whatsapp_agent.py` | Textos e envio de mensagens |
| `backend/database.py` | Estrutura das tabelas (DDL) |
| `backend/config.py` | Variáveis de ambiente disponíveis |
| `frontend/lib/api.ts` | Funções que chamam o backend |
| `frontend/app/atendimento/page.tsx` | Painel principal do atendente |
| `frontend/app/configuracoes/` | Todas as telas de configuração |
| `backend/.env` | Chaves e segredos (nunca commitar) |
| `frontend/.env.local` | Chaves do frontend (nunca commitar) |

---

## Como o banco é organizado

```
sectors       → setores do menu (Financeiro, Pedagógico, etc.)
    ↓
attendants    → atendentes vinculados a um setor
    ↓
conversations → cada conversa de um contato (tem sector_id e attendant_id)
    ↓
messages      → mensagens da conversa (direction: "in" ou "out")

api_keys      → chaves externas geradas pelo painel (hash SHA-256)
```

---

## Variáveis de ambiente que existem

### Backend (`backend/.env`)
| Variável | Para que serve |
|---|---|
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `EVOLUTION_INSTANCE` | Nome da instância WhatsApp |
| `ANTHROPIC_API_KEY` | Claude (opcional) |
| `ORG_NAME` | Nome da organização exibido no menu |
| `BOT_FALLBACK_PHONE` | Número que recebe alerta se ninguém atender |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_JWT_SECRET` | Segredo para verificar tokens de login |

### Frontend (`frontend/.env.local`)
| Variável | Para que serve |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL do backend (padrão: http://localhost:8000/api) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase |

---

## Padrões que o projeto usa

- **Rotas protegidas no frontend**: envolva o JSX com `<AuthGuard>` — ele redireciona para `/login` se não houver sessão.
- **Rotas protegidas no backend**: adicione `_: Auth` como parâmetro (onde `Auth = Annotated[dict, Depends(require_auth)]`).
- **Banco de dados**: use sempre `with get_conn() as conn:` — o commit e rollback são automáticos.
- **Envio de WhatsApp**: use `wa.send_text(phone, texto)` para mensagens simples. O `WhatsAppAgent` fica em `agents/whatsapp_agent.py`.
- **Overrides em tempo real**: salve em `settings_override.json` via `update_settings()`. Leia via `get_settings()`. Não precisa reiniciar o servidor.
