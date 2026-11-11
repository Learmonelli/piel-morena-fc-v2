@echo off
cd /d "%~dp0"
echo Iniciando Piel Morena v2... (deja esta ventana abierta mientras la uses)
start "" http://127.0.0.1:5173
call npm run dev
pause
