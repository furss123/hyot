# GitHub Actions Secrets 등록 (firebase-config 값)
# 사용: .\scripts\set-firebase-secrets.ps1 -ApiKey "..." -ProjectId "..." -AppId "..."
param(
  [Parameter(Mandatory = $true)][string]$ApiKey,
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$AppId,
  [string]$AuthDomain = "",
  [string]$MessagingSenderId = "",
  [string]$StorageBucket = "",
  [string]$Repo = "furss123/hyot"
)

if (-not $AuthDomain) { $AuthDomain = "$ProjectId.firebaseapp.com" }
if (-not $StorageBucket) { $StorageBucket = "$ProjectId.appspot.com" }

$secrets = @{
  HYOT_FIREBASE_API_KEY = $ApiKey
  HYOT_FIREBASE_PROJECT_ID = $ProjectId
  HYOT_FIREBASE_APP_ID = $AppId
  HYOT_FIREBASE_AUTH_DOMAIN = $AuthDomain
  HYOT_FIREBASE_MESSAGING_SENDER_ID = $MessagingSenderId
  HYOT_FIREBASE_STORAGE_BUCKET = $StorageBucket
}

foreach ($kv in $secrets.GetEnumerator()) {
  if ([string]::IsNullOrWhiteSpace($kv.Value)) { continue }
  Write-Host "Setting $($kv.Key)..."
  $kv.Value | gh secret set $kv.Key --repo $Repo
}

Write-Host "Done. Run: gh workflow run `"Deploy GitHub Pages`" --repo $Repo"
