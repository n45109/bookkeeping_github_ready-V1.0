param(
    [switch]$RemoveBrokenVenv,
    [switch]$RemoveLegacyLogs
)

$ErrorActionPreference = "Stop"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $baseDir "data"

$legacyDirs = @(
    (Join-Path $baseDir "venv_broken_20260607")
)

$legacyLogs = @(
    (Join-Path $dataDir "app-service.err.log"),
    (Join-Path $dataDir "app-service.log"),
    (Join-Path $dataDir "cloudflared-live.err.log"),
    (Join-Path $dataDir "cloudflared-live.log"),
    (Join-Path $dataDir "codex-server.err.log"),
    (Join-Path $dataDir "codex-server.out.log"),
    (Join-Path $dataDir "coldstart-err.log"),
    (Join-Path $dataDir "coldstart-out.log"),
    (Join-Path $dataDir "manual-uvicorn.err.log"),
    (Join-Path $dataDir "manual-uvicorn.out.log"),
    (Join-Path $dataDir "server-err.log"),
    (Join-Path $dataDir "server-out.log"),
    (Join-Path $dataDir "start-app.err.log"),
    (Join-Path $dataDir "start-app.log")
)

function Show-Items($label, $items) {
    Write-Host ""
    Write-Host "[$label]"
    foreach ($item in $items) {
        if (Test-Path $item) {
            $entry = Get-Item $item
            Write-Host ("- " + $entry.FullName)
        }
    }
}

Show-Items "Legacy directory candidates" $legacyDirs
Show-Items "Legacy log candidates" $legacyLogs

if (-not $RemoveBrokenVenv -and -not $RemoveLegacyLogs) {
    Write-Host ""
    Write-Host "Preview only. Nothing deleted."
    Write-Host "Use -RemoveBrokenVenv and/or -RemoveLegacyLogs to clean confirmed items."
    exit 0
}

if ($RemoveBrokenVenv) {
    foreach ($dir in $legacyDirs) {
        if (Test-Path $dir) {
            Remove-Item -LiteralPath $dir -Recurse -Force
            Write-Host "Removed legacy directory: $dir"
        }
    }
}

if ($RemoveLegacyLogs) {
    foreach ($log in $legacyLogs) {
        if (Test-Path $log) {
            Remove-Item -LiteralPath $log -Force
            Write-Host "Removed legacy log: $log"
        }
    }
}

Write-Host ""
Write-Host "Cleanup finished."
