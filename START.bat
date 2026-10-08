@echo off
setlocal
cd /d "%~dp0"
title Album Discovery App Launcher

:: 1. Verify dependencies first
where py >nul 2>nul
if %errorlevel% equ 0 (
    py -c "import webview, mutagen, yt_dlp, requests, imageio_ffmpeg" >nul 2>nul
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
        python -c "import webview, mutagen, yt_dlp, requests, imageio_ffmpeg" >nul 2>nul
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

:: 2. Ensure Desktop & App Shortcuts with Custom Icon exist
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_lnk.ps1" >nul 2>nul

:: 3. Launch in Windowless GUI Mode (No persistent console window)
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
    start "" py -u main.py
    exit /b 0
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    start "" python -u main.py
    exit /b 0
)

echo [ERROR] Python 3 was not detected. Please install Python 3.10+.
pause
exit /b 1




