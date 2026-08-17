[CmdletBinding()]
param(
    [string]$Label = "screenshot"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Confirm-SafeDesktop {
    Write-Host ""
    Write-Host "SECURITY CHECK" -ForegroundColor Yellow
    Write-Host "This script captures every visible monitor."
    Write-Host "Close settings.json, API dashboards, terminals with secrets,"
    Write-Host "email, chats, account pages, and personal notifications."
    Write-Host "The script does not read settings, environment variables, or the clipboard."
    $answer = Read-Host "Confirm that no API key or other secret is visible (type YES)"
    if ($answer -cne "YES") {
        Write-Host "Capture cancelled. No file was created." -ForegroundColor Yellow
        exit 0
    }
}

Confirm-SafeDesktop

$safeLabel = $Label -replace "[^A-Za-z0-9_-]", "_"
if ([string]::IsNullOrWhiteSpace($safeLabel)) {
    $safeLabel = "screenshot"
}

$captureDirectory = Join-Path -Path $PSScriptRoot -ChildPath "captures"
[void](New-Item -ItemType Directory -Path $captureDirectory -Force)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmssfff"
$outputPath = Join-Path -Path $captureDirectory -ChildPath "$timestamp-$safeLabel.png"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Write-Host "Capturing the full virtual desktop in 3 seconds..."
3..1 | ForEach-Object {
    Write-Host "$_..."
    Start-Sleep -Seconds 1
}

$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
if ($bounds.Width -le 0 -or $bounds.Height -le 0) {
    throw "Windows did not report a valid virtual-screen size."
}

$bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

try {
    $graphics.CopyFromScreen(
        $bounds.X,
        $bounds.Y,
        0,
        0,
        $bitmap.Size,
        [System.Drawing.CopyPixelOperation]::SourceCopy
    )
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host "Screenshot saved:" -ForegroundColor Green
Write-Host $outputPath
