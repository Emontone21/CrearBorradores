@echo off
setlocal
title Atencion
cd /d "%~dp0"

rem ---- Node.js instalado y en version 22.13 o superior (trae SQLite incluido) ----
where node >nul 2>nul
if errorlevel 1 goto :sin_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :node_viejo

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
for /f %%v in ('node -v') do echo  Tienes Node.js %%v y la app necesita la version 22.13 o mas reciente.
echo  Instala la version LTS desde https://nodejs.org (se abre ahora en tu navegador)
echo  y despues vuelve a hacer doble clic en iniciar.bat.
echo.
start "" https://nodejs.org/es
pause
exit /b 1

:fallo_instalacion
echo.
echo  No se pudieron instalar las dependencias. Revisa el mensaje de arriba
echo  y comprueba tu conexion a internet. Si el problema sigue, borra la carpeta
echo  node_modules y vuelve a hacer doble clic en iniciar.bat.
echo.
pause
exit /b 1
