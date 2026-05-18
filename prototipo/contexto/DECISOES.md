# Decisões Técnicas — Por que foi feito assim

> Registro das escolhas de arquitetura para evitar refazer o que já foi pensado.

---

## SQLite em vez de PostgreSQL

**Motivo:** escala atual da organização não justifica um servidor de banco separado. SQLite é um arquivo local (`data/batuira.db`), zero configuração, backup simples (copia o arquivo). Se o volume crescer, migrar para PostgreSQL é direto — o código usa SQL padrão.

---

## Supabase só para autenticação

**Motivo:** gerenciar senhas com hash, tokens JWT, e-mail de confirmação e reset de senha é complexo e arriscado de implementar do zero. O Supabase resolve tudo isso gratuitamente. O backend não depende do banco Supabase — só verifica o token JWT via JWKS.

---

## ES256 (assimétrico) em vez de HS256

**Motivo:** o novo formato de projetos Supabase usa ES256 por padrão. A verificação é feita buscando a chave pública no endpoint `/auth/v1/.well-known/jwks.json` — isso significa que o backend nunca precisa armazenar o segredo privado, só a chave pública.

---

## Modo dev sem autenticação

**Motivo:** facilitar desenvolvimento local. Se `SUPABASE_URL` estiver vazio no `.env`, todas as rotas protegidas são liberadas. Isso evita que um bug de auth bloqueie o trabalho de desenvolvimento.

---

## Menu por texto numerado (1, 2, 3, 4) em vez de botões interativos

**Motivo:** botões da Evolution API têm limite de 3 opções e nem sempre funcionam em todas as versões do WhatsApp. Texto numerado funciona universalmente e é fácil de expandir para mais setores.

---

## Polling no frontend em vez de WebSocket

**Motivo:** WebSocket exige infraestrutura adicional (redis pub/sub, etc.). Para o volume de atendimentos da organização, polling a cada 3–4 segundos é imperceptível e muito mais simples de manter. Pode ser migrado para Server-Sent Events no futuro se necessário.

---

## `settings_override.json` para configurações em tempo real

**Motivo:** permite alterar configurações (nome da org, bot ativo/inativo, chaves de API) sem reiniciar o servidor. O arquivo sobrescreve as variáveis do `.env` sem apagá-las.

---

## API Keys com prefixo `btr_` e hash SHA-256

**Motivo:** o prefixo facilita identificar a origem da chave (auditoria, revogar acidentalmente). SHA-256 é suficiente para chaves geradas aleatoriamente (não são senhas escolhidas por usuário, então rainbow tables não se aplicam). A chave completa só é exibida uma vez na criação — depois só o prefixo fica visível.
