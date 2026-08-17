param(
    [switch]$SkipCompile
)

$ErrorActionPreference = "Stop"
$pluginRoot = Split-Path -Parent $PSScriptRoot
$repositoryRoot = Split-Path -Parent $pluginRoot
$courseNotebook = Join-Path $PSScriptRoot "course-exercise-1_2.ipynb"
$selfStudyNotebook = Join-Path $PSScriptRoot "self-study-start.ipynb"

foreach ($requiredPath in @($courseNotebook, $selfStudyNotebook)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required demo file was not found: $requiredPath"
    }
}

if (-not $SkipCompile) {
    Push-Location $pluginRoot
    try {
        & npm.cmd run compile
        if ($LASTEXITCODE -ne 0) {
            throw "TypeScript compilation failed. The demo host was not started."
        }
    }
    finally {
        Pop-Location
    }
}

$codeCommand = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCommand) {
    throw "The VS Code command-line launcher ('code') is not available on PATH."
}

$arguments = @(
    "--new-window",
    "--extensionDevelopmentPath=$pluginRoot",
    $courseNotebook,
    $selfStudyNotebook
)

Start-Process -FilePath $codeCommand.Source -ArgumentList $arguments
Write-Host "Started the CellMate Extension Development Host with both demo notebooks."
Write-Host "No API key or VS Code setting was read or changed by this script."
