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
    $s2.WindowStyle = 7
    $s2.Description = "Album Discovery Studio"
    $s2.Save()
    Write-Host "[SUCCESS] Created Desktop Shortcut at: $shortcutPath" -ForegroundColor Green
}

Write-Host "[SUCCESS] Created App Folder Shortcut at: $localShortcut" -ForegroundColor Green

# 3. Notify Windows Shell to refresh icon cache immediately
try {
    $code = @'
    using System;
    using System.Runtime.InteropServices;
    public class WinShell {
        [DllImport("shell32.dll")]
        public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
'@
    $type = Add-Type -TypeDefinition $code -PassThru -ErrorAction SilentlyContinue
    if ($type) {
        [WinShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    }
} catch {}

