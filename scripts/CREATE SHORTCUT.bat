@echo off
setlocal
cd /d "%~dp0"
title Create Album Discovery Shortcut

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_lnk.ps1"

echo.
echo =========================================================
echo  [OK] Shortcut created on Desktop with custom icon!
echo =========================================================
echo.
timeout /t 3 >nul
exit /b 0
