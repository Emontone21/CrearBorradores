@echo off
REM ===================================================================
REM  Genera CrearBorradores.exe (un solo archivo, sin instalador).
REM  Se ejecuta en Windows, con Python 3.10 o superior instalado.
REM ===================================================================
setlocal
cd /d "%~dp0"

set "PY=python"
where py >nul 2>nul
if %errorlevel%==0 set "PY=py -3"

echo.
echo [1/4] Instalando dependencias...
%PY% -m pip install --upgrade pip
%PY% -m pip install -r requirements-dev.txt
if errorlevel 1 goto error

echo.
echo [2/4] Corriendo los tests...
%PY% -m unittest discover -s tests
if errorlevel 1 goto error

echo.
echo [3/4] Empaquetando el .exe...
set ICON=
set EXTRA=
if exist "assets\icon.ico" (
    set ICON=--icon assets\icon.ico
    set EXTRA=--add-data "assets\icon.ico;assets"
)
%PY% -m PyInstaller --noconfirm --clean --onefile --windowed ^
    --name CrearBorradores ^
    --paths src ^
    --hidden-import win32timezone ^
    %ICON% %EXTRA% ^
    run.py
if errorlevel 1 goto error

echo.
echo [4/4] Listo.
echo El programa quedo en:  %cd%\dist\CrearBorradores.exe
echo Ese unico archivo es el que se le pasa a cada persona.
echo.
pause
exit /b 0

:error
echo.
echo *** Hubo un error. Revisa los mensajes de arriba. ***
pause
exit /b 1
