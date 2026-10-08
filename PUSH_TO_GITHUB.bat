@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo   Album Discovery App - GitHub Sync Engine
echo   Target: https://github.com/dazzfbnew1-code/Album-Discovery-App
echo =======================================================
echo.

if not exist ".git" (
    echo [*] Initializing Git repository...
    git init
    git config user.name "dazzfbnew1-code"
    git config user.email "dazzfbnew1@users.noreply.github.com"
    git branch -M main
    git remote add origin https://github.com/dazzfbnew1-code/Album-Discovery-App.git
)

echo [*] Staging all files...
git add .

echo [*] Creating commit...
git commit -m "feat: complete Album Discovery App with dual-deck gapless audio, responsive layout, and clean architecture" >nul 2>&1

echo [*] Checking remote origin...
git remote set-url origin https://github.com/dazzfbnew1-code/Album-Discovery-App.git

echo.
echo [*] Pushing files to GitHub main branch...
echo    (If a GitHub sign-in window appears, please click Sign In to approve)
echo.

git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo   [SUCCESS] All files successfully uploaded to GitHub!
    echo   View your repository at:
    echo   https://github.com/dazzfbnew1-code/Album-Discovery-App
    echo =======================================================
) else (
    echo.
    echo =======================================================
    echo   [NOTICE] Git push could not complete automatically.
    echo   Please verify your GitHub credentials or internet connection.
    echo =======================================================
)

echo.
pause
