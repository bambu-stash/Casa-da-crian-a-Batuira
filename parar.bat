@echo off
title Batuira Bot - Encerrando

wsl -e bash -c "fuser -k 8000/tcp 2>/dev/null; fuser -k 3000/tcp 2>/dev/null"
taskkill /f /fi "WINDOWTITLE eq Batuira-Backend*"  >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq Batuira-Frontend*" >nul 2>&1

echo Encerrado.
