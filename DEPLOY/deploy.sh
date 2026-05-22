#!/bin/bash
# DEPLOY/deploy.sh
# Execute na VM para subir ou atualizar os containers.
# Pré-requisito: DEPLOY/.env preenchido com as credenciais reais.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "==> Verificando .env..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  echo "ERRO: $SCRIPT_DIR/.env não encontrado."
  echo "Copie DEPLOY/.env.example para DEPLOY/.env e preencha as variáveis."
  exit 1
fi

echo "==> Carregando variáveis de ambiente..."
set -a
source "$SCRIPT_DIR/.env"
set +a

echo "==> Copiando nginx.conf para /etc/nginx/sites-available/batuira..."
sudo cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/batuira
sudo ln -sf /etc/nginx/sites-available/batuira /etc/nginx/sites-enabled/batuira
sudo nginx -t && sudo systemctl reload nginx

echo "==> Baixando imagens mais recentes..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" pull

echo "==> Subindo containers..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" --env-file "$SCRIPT_DIR/.env" up -d --build

echo "==> Status dos containers:"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps

echo ""
echo "==> Deploy concluído!"
echo "    Evolution API: http://$(curl -s ifconfig.me):8080"
echo "    Back-end:      http://$(curl -s ifconfig.me):8000/api/health"
