@echo off
title IMPERADOR LOUNGE BAR - SISTEMA COMPLETO
cd /d "%~dp0"
echo ====================================================================
echo   INICIANDO SISTEMA IMPERADOR LOUNGE BAR (MENU TAGME + TABLET PIX + ERP)
echo ====================================================================
start http://localhost:3000
node server.js
pause

