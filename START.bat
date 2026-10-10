@echo off
setlocal
set PYTHONDONTWRITEBYTECODE=1
cd /d "%~dp0"
title Album Discovery App Launcher

:: Check if user ran directly from inside zip without extracting
echo "%~dp0" | findstr /i "\\AppData\\Local\\Temp\\" >nul
if %errorlevel% equ 0 (
    echo ========================================================
    echo   [NOTICE] PLEASE EXTRACT THE ZIP FILE BEFORE RUNNING!
    echo ========================================================
    echo.
    echo It looks like you opened START.bat directly from inside the ZIP.
    echo Windows cannot launch properly from a temporary folder.
    echo.
    echo How to fix:
    echo 1. Right-click the downloaded ZIP file.
    echo 2. Click "Extract All..." and extract to your PC.
    echo 3. Open the extracted folder and run START.bat.
    echo.
    pause
    exit /b 1
)

:: Find Python executable
set "PY_CMD="
where py >nul 2>nul
if %errorlevel% equ 0 set "PY_CMD=py"

if not defined PY_CMD (
    where python >nul 2>nul
    if %errorlevel% equ 0 set "PY_CMD=python"
)

if not defined PY_CMD (
    for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do (
        if exist "%%~D\python.exe" set "PY_CMD=%%~D\python.exe"
    )
)

if not defined PY_CMD (
    for /d %%D in ("%ProgramFiles%\Python3*") do (
        if exist "%%~D\python.exe" set "PY_CMD=%%~D\python.exe"
    )
)

if not defined PY_CMD (
    echo ========================================================
    echo   [ERROR] Python 3 was not detected on this computer!
    echo ========================================================
    echo.
    echo Please install Python 3.10+ from: https://www.python.org/downloads/
    echo Make sure to check the box: "Add Python to PATH" during installation.
    echo.
    pause
    exit /b 1
)

:: 1. Verify dependencies first
"%PY_CMD%" -c "import mutagen, yt_dlp, requests, imageio_ffmpeg, psutil" >nul 2>nul
if errorlevel 1 (
    echo [SETUP] Installing required modules for first run...
    "%PY_CMD%" -m pip install -r "%~dp0requirements.txt"
    if errorlevel 1 (
        echo [ERROR] Failed to install required dependencies. Please check your internet connection.
        pause
        exit /b 1
    )
)

:: 2. Check for updates in background (never delays startup)
start "" /b "%PY_CMD%" "%~dp0scripts\check_update.py" >nul 2>nul

:: 3. Create Desktop shortcut once on first run
if not exist "%userprofile%\Desktop\Album Discovery App.lnk" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update_lnk.ps1" >nul 2>nul
)

:: 4. Launch in Windowless GUI Mode (No persistent console window)
set "PYW_CMD="
where pyw >nul 2>nul
if %errorlevel% equ 0 set "PYW_CMD=pyw -3"

if not defined PYW_CMD (
    where pythonw >nul 2>nul
    if %errorlevel% equ 0 set "PYW_CMD=pythonw"
)

if not defined PYW_CMD (
    for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do (
        if exist "%%~D\pythonw.exe" set "PYW_CMD=%%~D\pythonw.exe"
    )
)

if defined PYW_CMD (
    start "" %PYW_CMD% main.py
    exit /b 0
)

start "" "%PY_CMD%" main.py
exit /b 0




