# Cloudflare Worker 릴레이 — GitHub Secrets 등록 후 배포
# 사용: .\scripts\set-cloudflare-secrets.ps1 -ApiToken "..." -AccountId "..."
param(
  [Parameter(Mandatory = $true)][string]$ApiToken,
  [Parameter(Mandatory = $true)][string]$AccountId,
  [string]$Repo = "furss123/hyot"
)

$ErrorActionPreference = "Stop"

Write-Host "Setting CLOUDFLARE_API_TOKEN..."
$ApiToken | gh secret set CLOUDFLARE_API_TOKEN --repo $Repo

Write-Host "Setting CLOUDFLARE_ACCOUNT_ID..."
$AccountId | gh secret set CLOUDFLARE_ACCOUNT_ID --repo $Repo

Write-Host "Running Deploy feedback relay (Cloudflare)..."
gh workflow run "Deploy feedback relay (Cloudflare)" --repo $Repo

Write-Host "Done. After the workflow finishes, Pages will redeploy automatically."
Write-Host "Check: https://github.com/$Repo/actions"
