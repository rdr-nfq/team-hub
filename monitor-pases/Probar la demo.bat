@echo off
REM Monitor de pases con datos inventados (sin red ni token).
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (py -3 monitor.py --demo) else (python monitor.py --demo)
if errorlevel 1 pause
