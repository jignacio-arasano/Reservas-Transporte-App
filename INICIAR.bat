@echo off
echo.
echo  =============================================
echo   COLECTIVO RESERVAS — Iniciando servidor...
echo  =============================================
echo.

REM Cargar variables del archivo .env si existe
if exist .env (
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" set %%a=%%b
    )
    echo  [OK] Archivo .env cargado
) else (
    echo  [!] No encontre el archivo .env
    echo      Copiando .env.example a .env...
    copy .env.example .env >nul
    echo  [!] Edita el archivo .env con tu Access Token de MercadoPago
    echo      El servidor arrancara en modo DEMO (sin pagos reales)
    echo.
)

REM Verificar que node_modules exista
if not exist node_modules (
    echo  [!] Instalando dependencias por primera vez...
    echo      Esto puede tardar un minuto...
    npm install
    echo.
)

echo  Abriendo navegador en http://localhost:3000 ...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
node server.js

pause
