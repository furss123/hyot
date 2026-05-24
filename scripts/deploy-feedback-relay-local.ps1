# 로컬에서 Cloudflare Worker 릴레이 배포 (wrangler 로그인 또는 API 토큰)
param(
  [string]$ApiToken = $env:CLOUDFLARE_API_TOKEN,
  [string]$AccountId = $env:CLOUDFLARE_ACCOUNT_ID,
  [string]$Repo = "furss123/hyot"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not $ApiToken -or -not $AccountId) {
  Write-Host @"

Cloudflare API 토큰과 Account ID가 필요합니다.

1. https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Edit Cloudflare Workers
3. Account ID: 대시보드 오른쪽 사이드바 또는 Workers URL

다시 실행:
  .\scripts\deploy-feedback-relay-local.ps1 -ApiToken "..." -AccountId "..."

"@
  exit 1
}

$env:CLOUDFLARE_API_TOKEN = $ApiToken
$env:CLOUDFLARE_ACCOUNT_ID = $AccountId
$env:WRANGLER_SEND_METRICS = "false"

Write-Host "Deploying Worker..."
$deployOut = npx wrangler@3.99.0 deploy 2>&1 | Out-String
Write-Host $deployOut
$relayUrl = $null
if ($deployOut -match 'https://[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev') {
  $relayUrl = $Matches[0]
}

$ghToken = gh auth token
$ingestJs = Invoke-RestMethod -Uri "https://furss123.github.io/hyot/js/feedback-auth.js" -UseBasicParsing
if ($ingestJs -match 'HYOT_FEEDBACK_INGEST_KEY="([^"]+)"') {
  $ingestKey = $Matches[1]
} else {
  Write-Warning "Could not read ingest key from live site; Worker INGEST_KEY must match FEEDBACK_INGEST_KEY secret."
  exit 1
}

Write-Host "Setting Worker secrets..."
$ghToken | npx wrangler@3.99.0 secret put GITHUB_TOKEN
$ingestKey | npx wrangler@3.99.0 secret put INGEST_KEY

if (-not $relayUrl) {
  Write-Error "Could not detect Worker URL from wrangler deploy output."
}
Write-Host "Relay URL: $relayUrl"

$relayUrl | gh secret set HYOT_FEEDBACK_RELAY_URL --repo $Repo
$ApiToken | gh secret set CLOUDFLARE_API_TOKEN --repo $Repo
$AccountId | gh secret set CLOUDFLARE_ACCOUNT_ID --repo $Repo

Write-Host "Redeploying GitHub Pages..."
gh workflow run "Deploy GitHub Pages" --repo $Repo
Write-Host "Done."
