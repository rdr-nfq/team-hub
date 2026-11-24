@echo off
REM Monitor de pases: abre la app en el navegador. Cierra esta ventana para pararla.
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 monitor.py %*) else (python monitor.py %*)
if errorlevel 1 pause
