# Register .githooks for post-commit auto push
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

git config core.hooksPath .githooks
Write-Host "core.hooksPath = .githooks"
Write-Host ""
Write-Host "Auto push triggers:"
Write-Host "  - Cursor agent stop hook (.cursor/hooks.json)"
Write-Host "  - After git commit (.githooks/post-commit)"
Write-Host "  - Manual: .\scripts\auto-push.ps1"
