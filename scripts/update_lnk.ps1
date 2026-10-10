$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }

if (Test-Path (Join-Path (Split-Path -Parent $scriptDir) "START.bat")) {
    $appDir = Split-Path -Parent $scriptDir
} elseif (Test-Path (Join-Path $scriptDir "START.bat")) {
    $appDir = $scriptDir
} else {
    $appDir = (Get-Location).Path
}

$iconFile = Join-Path $appDir "ui\app_icon.ico"
if (-not (Test-Path $iconFile)) {
    $iconFile = Join-Path $appDir "ui\favicon.ico"
}

$ws = New-Object -ComObject WScript.Shell

# 1. Create In-Folder Shortcut
$localShortcut = Join-Path $appDir "Album Discovery App.lnk"
$s1 = $ws.CreateShortcut($localShortcut)
$s1.TargetPath = Join-Path $appDir "START.bat"
$s1.WorkingDirectory = $appDir
$s1.IconLocation = "$iconFile,0"
$s1.WindowStyle = 7
$s1.Description = "Album Discovery Studio"
$s1.Save()

# 2. Create Desktop Shortcut
$desktop = [Environment]::GetFolderPath("Desktop")
if ($desktop -and (Test-Path $desktop)) {
    $shortcutPath = Join-Path $desktop "Album Discovery App.lnk"
    $s2 = $ws.CreateShortcut($shortcutPath)
    $s2.TargetPath = Join-Path $appDir "START.bat"
    $s2.WorkingDirectory = $appDir
    $s2.IconLocation = "$iconFile,0"
    $s2.WindowStyle = 1
    $s2.Description = "Album Discovery Studio"
    $s2.Save()
    Write-Host "[SUCCESS] Created Desktop Shortcut at: $shortcutPath" -ForegroundColor Green
}

Write-Host "[SUCCESS] Created App Folder Shortcut at: $localShortcut" -ForegroundColor Green

# 3. Ensure App Directory Remains a Standard Yellow Folder (Never an icon)
$iniPath = Join-Path $appDir "desktop.ini"
try {
    if (Test-Path $iniPath) {
        attrib -h -s -r $iniPath
        Remove-Item $iniPath -Force -ErrorAction SilentlyContinue
    }
    attrib -r $appDir
    Write-Host "[SUCCESS] Confirmed folder format (standard folder icon)" -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not reset folder attributes: $_" -ForegroundColor Yellow
}

# 4. Icon cache update complete
Write-Host "[SUCCESS] Setup complete." -ForegroundColor Green

