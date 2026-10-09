@echo off
setlocal
cd /d "%~dp0.."
title Album Discovery Studio - Recover Missing Tracks

echo =========================================================
echo   Album Discovery Studio - Track Recovery Engine
echo =========================================================
echo.
echo Scanning your downloaded music for any missing tracks
echo or incomplete album sequence gaps...
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    py "%~dp0requeue_missing_and_failed.py" --monitor
    goto done
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    python "%~dp0requeue_missing_and_failed.py" --monitor
    goto done
)

echo [ERROR] Python 3 was not detected on this system.
pause
exit /b 1

:done
echo.
echo =========================================================
echo  [DONE] Track scan complete!
echo =========================================================
echo.
pause
exit /b 0
