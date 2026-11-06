@echo off
chcp 65001 >nul
title IMPERADOR LOUNGE BAR - SISTEMA EM PYTHON + SQLITE3
cd /d "%~dp0"
echo ====================================================================
echo   INICIANDO IMPERADOR LOUNGE BAR EM PYTHON (SQLite3 + PIX BRCode)
echo ====================================================================
python app.py
pause

