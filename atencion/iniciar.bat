@echo off
setlocal
title Atencion
cd /d "%~dp0"

rem ---- Node.js instalado y en version 22 o superior ----
where node >nul 2>nul
if errorlevel 1 goto :sin_node
for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set "NODE_MAYOR=%%v"
if %NODE_MAYOR% LSS 22 goto :node_viejo

rem ---- Dependencias: la primera vez tarda; despues solo comprueba ----
echo.
echo  Comprobando dependencias (la primera vez puede tardar un par de minutos)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto :fallo_instalacion

rem ---- Arrancar y abrir el navegador ----
echo.
echo  Iniciando Atencion. Se abrira sola en tu navegador: http://127.0.0.1:3001
echo  Mientras la uses, deja esta ventana abierta. Para cerrar la app, cierra esta ventana.
echo.
call npm run iniciar --silent
echo.
pause
exit /b 0

:sin_node
echo.
echo  No se encontro Node.js en este equipo.
echo  Instala la version LTS desde https://nodejs.org (se abre ahora en tu navegador)
echo  y despues vuelve a hacer doble clic en iniciar.bat.
echo.
start "" https://nodejs.org/es
pause
exit /b 1

:node_viejo
echo.
echo  Tienes Node.js %NODE_MAYOR% y la app necesita la version 22 o mas reciente.
echo  Instala la version LTS desde https://nodejs.org (se abre ahora en tu navegador)
echo  y despues vuelve a hacer doble clic en iniciar.bat.
echo.
start "" https://nodejs.org/es
pause
exit /b 1

:fallo_instalacion
echo.
echo  No se pudieron instalar las dependencias. Revisa el mensaje de arriba.
echo  Comprueba tu conexion a internet. Si el error menciona better-sqlite3,
echo  instala la version LTS de Node.js desde https://nodejs.org y vuelve a intentarlo.
echo.
pause
exit /b 1
