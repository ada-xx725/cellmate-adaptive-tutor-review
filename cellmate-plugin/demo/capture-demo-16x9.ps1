[CmdletBinding()]
param(
    [string]$Label = "demo",
    [ValidateRange(640, 3840)]
    [int]$OutputWidth = 1920,
    [ValidateRange(360, 2160)]
    [int]$OutputHeight = 1080
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([Math]::Abs(($OutputWidth / $OutputHeight) - (16 / 9)) -gt 0.01) {
    throw "OutputWidth and OutputHeight must use a 16:9 aspect ratio."
}

Write-Host ""
Write-Host "SECURITY CHECK" -ForegroundColor Yellow
Write-Host "This script captures the visible Extension Development Host window."
Write-Host "Close settings, API keys, personal notifications, and unrelated windows."
$answer = Read-Host "Confirm that no secret is visible (type YES)"
if ($answer -cne "YES") {
    Write-Host "Capture cancelled. No file was created." -ForegroundColor Yellow
    exit 0
}

if (-not ("DemoCaptureWindow" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DemoCaptureWindow {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr handle, int command);
}
"@
}

$hostProcess = Get-Process Code -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like "[[]Extension Development Host[]]*" } |
    Select-Object -First 1
if ($null -eq $hostProcess) {
    throw "An Extension Development Host window was not found."
}

[void][DemoCaptureWindow]::ShowWindowAsync($hostProcess.MainWindowHandle, 3)
[void][DemoCaptureWindow]::SetForegroundWindow($hostProcess.MainWindowHandle)
Start-Sleep -Seconds 2

$rect = [DemoCaptureWindow+RECT]::new()
if (-not [DemoCaptureWindow]::GetWindowRect($hostProcess.MainWindowHandle, [ref]$rect)) {
    throw "Windows did not return the Extension Development Host bounds."
}

$windowWidth = $rect.Right - $rect.Left
$windowHeight = $rect.Bottom - $rect.Top
if ($windowWidth -le 0 -or $windowHeight -le 0) {
    throw "The Extension Development Host has invalid capture bounds."
}

$targetRatio = 16 / 9
$windowRatio = $windowWidth / $windowHeight
if ($windowRatio -gt $targetRatio) {
    $cropHeight = $windowHeight
    $cropWidth = [int][Math]::Floor($cropHeight * $targetRatio)
    $cropLeft = $rect.Left + [int][Math]::Floor(($windowWidth - $cropWidth) / 2)
    $cropTop = $rect.Top
}
else {
    $cropWidth = $windowWidth
    $cropHeight = [int][Math]::Floor($cropWidth / $targetRatio)
    $cropLeft = $rect.Left
    # Keep the VS Code title, notebook tabs, and result cells in frame.
    $cropTop = $rect.Top
}

Add-Type -AssemblyName System.Drawing
$source = [System.Drawing.Bitmap]::new($cropWidth, $cropHeight)
$sourceGraphics = [System.Drawing.Graphics]::FromImage($source)
$output = [System.Drawing.Bitmap]::new($OutputWidth, $OutputHeight)
$outputGraphics = [System.Drawing.Graphics]::FromImage($output)

try {
    $sourceGraphics.CopyFromScreen(
        $cropLeft,
        $cropTop,
        0,
        0,
        $source.Size,
        [System.Drawing.CopyPixelOperation]::SourceCopy
    )
    $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $outputGraphics.DrawImage($source, 0, 0, $OutputWidth, $OutputHeight)

    $safeLabel = $Label -replace "[^A-Za-z0-9_-]", "_"
    $captureDirectory = Join-Path $PSScriptRoot "captures"
    [void](New-Item -ItemType Directory -Path $captureDirectory -Force)
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
    $outputPath = Join-Path $captureDirectory "$timestamp-$safeLabel-16x9.png"
    $output.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $sourceGraphics.Dispose()
    $outputGraphics.Dispose()
    $source.Dispose()
    $output.Dispose()
}

Write-Host "16:9 demo screenshot saved:" -ForegroundColor Green
Write-Host $outputPath
