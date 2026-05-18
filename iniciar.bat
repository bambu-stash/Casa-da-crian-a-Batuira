@echo off
title Batuira Bot

REM Limpa portas antes de subir
wsl -e bash -c "fuser -k 8000/tcp 2>/dev/null; fuser -k 3000/tcp 2>/dev/null" >nul 2>&1

REM Sobe backend e frontend minimizados
start "Batuira-Backend"  /min wsl -e bash -c "cd '/mnt/c/Users/Dell/Desktop/Nova pasta/clwbot buds/prototipo/backend'  && venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000"
start "Batuira-Frontend" /min wsl -e bash -c "cd '/mnt/c/Users/Dell/Desktop/Nova pasta/clwbot buds/prototipo/frontend' && npm run dev"

REM Aguarda backend responder (testa a cada 1s, limite 30s)
echo Iniciando...
set t=0

:wait
curl -s http://localhost:8000/api/health >nul 2>&1
if not errorlevel 1 goto open
set /a t+=1
if %t% gtr 30 goto open
timeout /t 1 /nobreak >nul
goto wait

:open
start http://localhost:3000
echo Pronto: http://localhost:3000
