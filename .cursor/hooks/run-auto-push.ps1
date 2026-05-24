# Cursor stop 훅 — 에이전트 작업 종료 시 변경 사항 자동 push
$ErrorActionPreference = "SilentlyContinue"
$null = [Console]::In.ReadToEnd()
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot.Path
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts/auto-push.ps1"
exit 0
