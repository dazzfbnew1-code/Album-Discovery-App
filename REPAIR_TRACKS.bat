@echo off
setlocal
cd /d "%~dp0"
title Track Duration Mismatch Repair
echo ========================================================
echo   Album Discovery - Track Duration Mismatch Repair
echo ========================================================
echo Scanning library and replacing any oversized full-album
echo files with authentic full-length studio master recordings...
echo.
python scripts/repair_mismatches.py
echo.
pause
