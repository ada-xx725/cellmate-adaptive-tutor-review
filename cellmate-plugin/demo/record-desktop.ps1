[CmdletBinding()]
param(
    [string]$Label = "demo",
    [ValidateRange(0, 3600)]
    [int]$DurationSeconds = 0,
    [ValidateRange(5, 60)]
    [int]$FrameRate = 15
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Confirm-SafeDesktop {
    Write-Host ""
    Write-Host "SECURITY CHECK" -ForegroundColor Yellow
    Write-Host "This script records every visible monitor and intentionally records no audio."
    Write-Host "Close settings.json, API dashboards, terminals with secrets,"
    Write-Host "email, chats, account pages, and personal notifications."
    Write-Host "The script does not read settings, environment variables, or the clipboard."
    $answer = Read-Host "Confirm that no API key or other secret is visible (type YES)"
    if ($answer -cne "YES") {
        Write-Host "Recording cancelled. No file was created." -ForegroundColor Yellow
        exit 0
    }
}

function Find-Ffmpeg {
    $candidates = @(
        Get-Command "ffmpeg.exe" -CommandType Application -All -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty Source
    )

    $pluginRoot = Split-Path -Parent $PSScriptRoot
    $candidates += Join-Path $pluginRoot "node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe"

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            continue
        }

        $deviceList = & $candidate -hide_banner -devices 2>&1 | Out-String
        if ($deviceList -match "(?m)^\s*D\s+gdigrab\s") {
            return $candidate
        }
    }

    return $null
}

function Find-AnyFfmpeg {
    $command = Get-Command "ffmpeg.exe" -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -ne $command) {
        return $command.Source
    }

    $pluginRoot = Split-Path -Parent $PSScriptRoot
    $bundled = Join-Path $pluginRoot "node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe"
    if (Test-Path -LiteralPath $bundled -PathType Leaf) {
        return $bundled
    }

    return $null
}

function Invoke-GameBarShortcut {
    if (-not ("GameBarKeys" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class GameBarKeys {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);

    public static void ToggleRecording() {
        const byte VK_LWIN = 0x5B;
        const byte VK_MENU = 0x12;
        const byte VK_R = 0x52;
        const uint KEYUP = 0x0002;
        keybd_event(VK_LWIN, 0, 0, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
        keybd_event(VK_R, 0, 0, UIntPtr.Zero);
        keybd_event(VK_R, 0, KEYUP, UIntPtr.Zero);
        keybd_event(VK_MENU, 0, KEYUP, UIntPtr.Zero);
        keybd_event(VK_LWIN, 0, KEYUP, UIntPtr.Zero);
    }
}
"@
    }
    [GameBarKeys]::ToggleRecording()
}

function Focus-ExtensionHost {
    $hostProcess = Get-Process Code -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -like "[[]Extension Development Host[]]*" } |
        Select-Object -First 1
    if ($null -eq $hostProcess) {
        throw "An Extension Development Host window was not found."
    }

    if (-not ("DemoWindowFocus" -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DemoWindowFocus {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr handle, int command);
}
"@
    }
    [void][DemoWindowFocus]::ShowWindowAsync($hostProcess.MainWindowHandle, 3)
    [void][DemoWindowFocus]::SetForegroundWindow($hostProcess.MainWindowHandle)
    Start-Sleep -Seconds 2
}

function Record-WithGameBar {
    param(
        [string]$SafeOutputPath,
        [int]$Seconds
    )

    $captureDirectory = Join-Path ([Environment]::GetFolderPath("MyVideos")) "Captures"
    [void](New-Item -ItemType Directory -Path $captureDirectory -Force)
    $startedAt = Get-Date

    Focus-ExtensionHost
    Write-Host "The bundled ffmpeg cannot capture the desktop; using Windows Game Bar."
    Write-Host "The final demo copy will be saved without audio." -ForegroundColor Cyan
    Invoke-GameBarShortcut

    if ($Seconds -gt 0) {
        Start-Sleep -Seconds $Seconds
    }
    else {
        Read-Host "Recording is active. Return here and press ENTER to stop"
        Focus-ExtensionHost
    }
    Invoke-GameBarShortcut
    Start-Sleep -Seconds 3

    $source = Get-ChildItem -LiteralPath $captureDirectory -File -Filter "*.mp4" -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -ge $startedAt.AddSeconds(-2) } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $source) {
        throw "Game Bar did not create a new MP4. Check that Xbox Game Bar capture is enabled, then try again."
    }

    $encoder = Find-AnyFfmpeg
    if ($null -eq $encoder) {
        throw "Game Bar saved $($source.FullName), but ffmpeg was not found to remove its audio track."
    }

    & $encoder -hide_banner -loglevel warning -n -i $source.FullName -map 0:v:0 -c:v copy -an -movflags +faststart $SafeOutputPath
    if ($LASTEXITCODE -ne 0) {
        throw "Game Bar saved $($source.FullName), but the audio-free demo copy could not be created."
    }

    Write-Host "Game Bar source capture (may contain audio):" -ForegroundColor Yellow
    Write-Host $source.FullName
}

Confirm-SafeDesktop

$ffmpegPath = Find-Ffmpeg

$safeLabel = $Label -replace "[^A-Za-z0-9_-]", "_"
if ([string]::IsNullOrWhiteSpace($safeLabel)) {
    $safeLabel = "demo"
}

$captureDirectory = Join-Path -Path $PSScriptRoot -ChildPath "captures"
[void](New-Item -ItemType Directory -Path $captureDirectory -Force)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$outputPath = Join-Path -Path $captureDirectory -ChildPath "$timestamp-$safeLabel.mp4"

if ($null -eq $ffmpegPath) {
    Record-WithGameBar -SafeOutputPath $outputPath -Seconds $DurationSeconds
    Write-Host "Audio-free recording saved:" -ForegroundColor Green
    Write-Host $outputPath
    exit 0
}

$arguments = @(
    "-hide_banner",
    "-loglevel", "warning",
    "-n",
    "-f", "gdigrab",
    "-framerate", $FrameRate.ToString(),
    "-draw_mouse", "1",
    "-i", "desktop",
    "-an"
)

if ($DurationSeconds -gt 0) {
    $arguments += @("-t", $DurationSeconds.ToString())
}

$arguments += @(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    $outputPath
)

Write-Host "Recording the full virtual desktop in 3 seconds..."
if ($DurationSeconds -eq 0) {
    Write-Host "Return to this terminal and press q to stop cleanly." -ForegroundColor Cyan
}
else {
    Write-Host "The recording will stop after $DurationSeconds seconds." -ForegroundColor Cyan
}

3..1 | ForEach-Object {
    Write-Host "$_..."
    Start-Sleep -Seconds 1
}

& $ffmpegPath @arguments
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    throw "ffmpeg exited with code $exitCode. No existing capture was overwritten."
}

Write-Host "Recording saved:" -ForegroundColor Green
Write-Host $outputPath
