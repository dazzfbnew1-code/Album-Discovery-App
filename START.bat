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

:: 1. Verify dependencies first
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -c "import mutagen, yt_dlp, requests, imageio_ffmpeg" >nul 2>nul
    if errorlevel 1 (
        echo [SETUP] Installing required modules for first run...
        py -m pip install -r requirements.txt
        if errorlevel 1 (
            echo [ERROR] Failed to install required dependencies. Please check your internet connection.
            pause
            exit /b 1
        )
    )
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        python -c "import mutagen, yt_dlp, requests, imageio_ffmpeg" >nul 2>nul
        if errorlevel 1 (
            echo [SETUP] Installing required modules for first run...
            python -m pip install -r requirements.txt
            if errorlevel 1 (
                echo [ERROR] Failed to install required dependencies. Please check your internet connection.
                pause
                exit /b 1
            )
        )
    )
)

:: 2. Check for updates in background (never delays startup)
where py >nul 2>nul
if %errorlevel% equ 0 (
    start "" /b py "%~dp0scripts\check_update.py" >nul 2>nul
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        start "" /b python "%~dp0scripts\check_update.py" >nul 2>nul
    )
)

:: 3. Create Desktop shortcut once on first run
if not exist "%userprofile%\Desktop\Album Discovery App.lnk" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update_lnk.ps1" >nul 2>nul
)

:: 4. Launch in Windowless GUI Mode (No persistent console window)
where pyw >nul 2>nul
if %errorlevel% equ 0 (
    start "" pyw -3 main.py
    exit /b 0
)

where pythonw >nul 2>nul
if %errorlevel% equ 0 (
    start "" pythonw main.py
    exit /b 0
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    start "" py -3 main.py
    exit /b 0
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    start "" python main.py
    exit /b 0
)

echo [ERROR] Python 3 was not detected. Please install Python 3.10+.
pause
exit /b 1




