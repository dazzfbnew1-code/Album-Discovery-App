@echo off
setlocal
cd /d "%~dp0.."
title Album Discovery Studio - Maintenance Toolbox

:menu
cls
echo =========================================================
echo   Album Discovery Studio - Maintenance Toolbox
echo =========================================================
echo.
echo   [1] Recover Missing Album Tracks
echo   [2] Repair Track Duration Mismatches (Full-Album Fix)
echo   [3] Recreate Desktop App Shortcut
echo   [4] Backup Current Version to GitHub (Beta)
echo   [5] Promote to Stable Release (Clean ZIP for Dad)
echo   [6] Exit
echo.
echo =========================================================
set /p opt="Select an option [1-6]: "

if "%opt%"=="1" (
    cls
    call "%~dp0RECOVER_MISSING_TRACKS.bat"
    goto menu
)
if "%opt%"=="2" (
    cls
    echo Scanning library for duration mismatches...
    python "%~dp0repair_mismatches.py"
    echo.
    pause
    goto menu
)
if "%opt%"=="3" (
    cls
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_lnk.ps1"
    pause
    goto menu
)
if "%opt%"=="4" (
    cls
    call "%~dp0PUSH_TO_GITHUB.bat"
    goto menu
)
if "%opt%"=="5" (
    cls
    call "%~dp0PROMOTE_TO_STABLE.bat"
    goto menu
)
if "%opt%"=="6" exit /b 0

goto menu
