#!/bin/bash
# DEPLOY/setup-vm.sh
# Executar na VM Oracle Cloud como ubuntu:
# chmod +x setup-vm.sh && ./setup-vm.sh

set -e

echo "==> Atualizando sistema..."
sudo apt-get update && sudo apt-get upgrade -y

echo "==> Instalando Docker..."
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

echo "==> Instalando Docker Compose..."
sudo apt-get install -y docker-compose-plugin

echo "==> Instalando Nginx e Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Configurando firewall Ubuntu (ufw)..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 8080/tcp
sudo ufw --force enable

echo "==> Criando diretório do projeto..."
mkdir -p ~/evolution-bot

echo "==> Setup concluído. Faça logout e login novamente para aplicar grupo docker."
