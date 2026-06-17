# Guia de Deploy — Batuira Bot

**Arquitetura:**
- **Backend** (FastAPI + SQLite) → [Fly.io](https://fly.io) via Docker
- **Frontend** (Next.js) → [Vercel](https://vercel.com)

---

## Parte 1 — Backend no Fly.io

### 1.1 Criar conta no Fly.io

Acesse https://fly.io e crie uma conta gratuita.

> O plano gratuito inclui 3 máquinas compartilhadas e 3 GB de volumes — suficiente para este projeto.

---

### 1.2 Instalar o flyctl (CLI do Fly.io)

No **WSL / Linux**, execute no terminal:

```bash
curl -L https://fly.io/install.sh | sh
```

Após a instalação, adicione o flyctl ao PATH seguindo a instrução exibida no terminal. Geralmente:

```bash
export FLYCTL_INSTALL="/home/$USER/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
```

Cole essas duas linhas no final do seu `~/.bashrc` ou `~/.zshrc` e recarregue:

```bash
source ~/.bashrc   # ou source ~/.zshrc
```

Verifique a instalação:

```bash
flyctl version
```

---

### 1.3 Autenticar no Fly.io

```bash
fly auth login
```

Um navegador abrirá pedindo login. Após autenticar, o terminal confirmará com:
```
successfully logged in as seu@email.com
```

---

### 1.4 Criar a aplicação no Fly.io

Entre na pasta do backend:

```bash
cd "prototipo/backend"
```

Execute o comando de criação. A flag `--no-deploy` cria a app e o `fly.toml` sem fazer deploy ainda — isso é importante porque precisamos criar o volume primeiro:

```bash
fly launch --name casa-da-crian-a-batuira --region gru --no-deploy
```

> - `--name casa-da-crian-a-batuira` → nome da sua app (deve ser único no Fly.io globalmente)
> - `--region gru` → São Paulo (mais próximo do Brasil)
> - `--no-deploy` → não faz deploy ainda

O Fly.io detectará o `Dockerfile` automaticamente. Quando perguntar **"Would you like to copy its configuration to the new app?"**, responda `y`.

Quando perguntar **"Would you like to set up a Postgresql database?"**, responda `N`.

Quando perguntar **"Would you like to set up an Upstash Redis database?"**, responda `N`.

---

### 1.5 Criar o volume para o SQLite

O banco SQLite e os arquivos de configuração ficam em `/app/data` dentro do container. Para que esses dados sobrevivam a deploys e reinícios, é necessário um volume persistente:

```bash
fly volumes create batuira_data --region gru --size 1
```

> - `batuira_data` → nome do volume (deve bater com o `source` no `fly.toml`)
> - `--region gru` → mesma região da app (obrigatório)
> - `--size 1` → 1 GB (suficiente para SQLite)

Verifique se o volume foi criado:

```bash
fly volumes list
```

A saída mostrará o volume com estado `created`.

---

### 1.6 Configurar as variáveis de ambiente (Secrets)

Os secrets são injetados como variáveis de ambiente em tempo de execução e ficam **encriptados** no Fly.io — nunca ficam expostos nos logs ou no código.

Configure todos de uma vez (substitua os valores):

```bash
fly secrets set \
  ANTHROPIC_API_KEY="sk-ant-XXXXXXXXXXXXXXXX" \
  EVOLUTION_API_URL="https://sua-evolution-api.com" \
  EVOLUTION_API_KEY="sua-chave-evolution" \
  EVOLUTION_INSTANCE="batuira" \
  ORG_NAME="Casa da Criança Batuira" \
  BOT_FALLBACK_PHONE="5511999990000" \
  SUPABASE_URL="https://xxxx.supabase.co" \
  SUPABASE_JWT_SECRET="seu-jwt-secret-do-supabase" \
  ALLOWED_ORIGINS="https://batuira-bot.vercel.app"
```

> **Importante:** `ALLOWED_ORIGINS` deve ser a URL final do seu frontend na Vercel.
> Se ainda não sabe a URL, coloque temporariamente `https://placeholder.vercel.app`
> e atualize depois do deploy do frontend com:
> ```bash
> fly secrets set ALLOWED_ORIGINS="https://seu-app-real.vercel.app"
> ```

Para verificar quais secrets estão configurados (os valores ficam ocultos):

```bash
fly secrets list
```

---

### 1.7 Verificar o fly.toml

Abra o arquivo `fly.toml` na pasta `backend/` e confirme que está assim:

```toml
app = "casa-da-crian-a-batuira"
primary_region = "gru"

[build]

[env]
  PORT = "8000"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[mounts]]
  source = "batuira_data"
  destination = "/app/data"

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

---

### 1.8 Fazer o deploy do backend

```bash
fly deploy
```

O Fly.io irá:
1. Construir a imagem Docker localmente
2. Fazer upload para o registro interno do Fly.io
3. Iniciar a máquina com o volume montado
4. Executar a health check

Aguarde a mensagem:
```
--> v1 deployed successfully
```

---

### 1.9 Verificar o backend em produção

Abra a URL da sua app:

```bash
fly open
```

Ou acesse diretamente: `https://casa-da-crian-a-batuira.fly.dev/api/health`

A resposta deve ser:
```json
{"status": "ok", "services": {"evolution_api": "configured", "anthropic": "configured"}}
```

Para ver os logs em tempo real:

```bash
fly logs
```

---

## Parte 2 — Frontend no Vercel

### 2.1 Criar conta na Vercel

Acesse https://vercel.com e crie uma conta usando sua conta do **GitHub** (recomendado — facilita a integração).

---

### 2.2 Subir o código para o GitHub

O Vercel faz deploy automaticamente a partir de um repositório Git. Se ainda não tem o projeto no GitHub:

```bash
# Na raiz do projeto (pasta "prototipo" ou superior)
git init
git add .
git commit -m "inicial"
```

Crie um repositório no GitHub (acesse https://github.com/new) e siga as instruções para fazer push:

```bash
git remote add origin https://github.com/seu-usuario/batuira-bot.git
git branch -M main
git push -u origin main
```

---

### 2.3 Importar o projeto na Vercel

1. No dashboard da Vercel, clique em **"Add New…"** → **"Project"**
2. Na lista de repositórios, localize **batuira-bot** e clique em **"Import"**

---

### 2.4 Configurar o Root Directory

Como o código do frontend está dentro de uma subpasta (`prototipo/frontend`), você precisa indicar isso:

1. Na tela de configuração do projeto, localize **"Root Directory"**
2. Clique em **"Edit"**
3. Navegue até `prototipo/frontend` e selecione essa pasta
4. Clique em **"Continue"**

> O Vercel detectará automaticamente o framework como **Next.js**.

---

### 2.5 Configurar as variáveis de ambiente

Ainda na tela de configuração (antes de clicar em Deploy), role até a seção **"Environment Variables"**.

Adicione as três variáveis abaixo, uma por vez:

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://casa-da-crian-a-batuira.fly.dev/api` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | Production, Preview, Development |

Para cada variável:
1. Digite o **Name** no campo "Key"
2. Digite o **Value**
3. Selecione os ambientes: marque **Production**, **Preview** e **Development**
4. Clique em **"Add"**

> Variáveis com prefixo `NEXT_PUBLIC_` ficam expostas no browser — nunca coloque
> secrets sensíveis com esse prefixo.

---

### 2.6 Fazer o primeiro deploy

Após configurar as variáveis, clique em **"Deploy"**.

A Vercel irá:
1. Clonar o repositório
2. Instalar dependências (`npm install`)
3. Executar o build (`npm run build`)
4. Publicar os arquivos estáticos na CDN global

Aguarde a tela de confirmação com o link da sua aplicação:
```
🎉 Congratulations! Your project has been successfully deployed.
https://batuira-bot.vercel.app
```

---

### 2.7 Atualizar ALLOWED_ORIGINS no backend

Agora que você tem a URL real do frontend, atualize o secret no Fly.io:

```bash
cd "prototipo/backend"
fly secrets set ALLOWED_ORIGINS="https://batuira-bot.vercel.app"
```

Isso irá reiniciar automaticamente a máquina com o novo valor.

---

## Parte 3 — Configurações pós-deploy

### 3.1 Webhook da Evolution API

No painel da Evolution API, configure o webhook apontando para o backend em produção:

- **URL:** `https://casa-da-crian-a-batuira.fly.dev/api/whatsapp/webhook`
- **Evento:** `messages.upsert`

---

### 3.2 Deploys futuros

**Backend** — qualquer alteração no backend basta rodar:
```bash
cd "prototipo/backend"
fly deploy
```

**Frontend** — qualquer `git push` para a branch `main` dispara um novo deploy automático na Vercel.

---

### 3.3 Comandos úteis do Fly.io

```bash
fly status          # status da app e das machines
fly logs            # logs em tempo real
fly ssh console     # acesso SSH ao container
fly volumes list    # lista volumes e estado
fly secrets list    # lista secrets configurados
fly scale show      # mostra configuração de CPU/memória
```

---

## Resumo das URLs

| Serviço | URL |
|---------|-----|
| Backend (API) | `https://casa-da-crian-a-batuira.fly.dev` |
| Backend (health) | `https://casa-da-crian-a-batuira.fly.dev/api/health` |
| Backend (webhook) | `https://casa-da-crian-a-batuira.fly.dev/api/whatsapp/webhook` |
| Frontend | `https://batuira-bot.vercel.app` |
