# HyoT - print catalog / feedback registration links after downloads/ push
param(
  [string[]]$Paths = @(),
  [string]$Commit = "HEAD",
  [string]$UtilityId = "",
  [string]$UtilityName = "",
  [string]$Owner = "",
  [string]$Repo = "",
  [string]$Branch = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

function Read-GithubConfig {
  $cfgPath = Join-Path $repoRoot "js\admin-config.js"
  $owner = "furss123"
  $repo = "hyot"
  $branch = "main"
  if (Test-Path $cfgPath) {
    $text = Get-Content $cfgPath -Raw -Encoding UTF8
    if ($text -match 'owner:\s*"([^"]+)"') { $owner = $Matches[1] }
    if ($text -match 'repo:\s*"([^"]+)"') { $repo = $Matches[1] }
    if ($text -match 'branch:\s*"([^"]+)"') { $branch = $Matches[1] }
  }
  [pscustomobject]@{ Owner = $owner; Repo = $repo; Branch = $branch }
}

function Normalize-RepoPath([string]$raw) {
  $p = $raw.Trim().Replace("\", "/").TrimStart("/")
  if ($p -notmatch "^downloads/") {
    $leaf = Split-Path $raw -Leaf
    $p = "downloads/$leaf"
  }
  $p
}

function Get-MediaDownloadUrl($owner, $repo, $branch, $repoPath) {
  $encBranch = [uri]::EscapeDataString($branch)
  $segments = ($repoPath -split "/") | ForEach-Object { [uri]::EscapeDataString($_) }
  $encPath = $segments -join "/"
  "https://media.githubusercontent.com/media/$owner/$repo/$encBranch/$encPath"
}

function Get-PagesBaseUrl($owner, $repo) {
  if ($owner -eq "furss123" -and $repo -eq "hyot") {
    return "https://furss123.github.io/hyot"
  }
  "https://$owner.github.io/$repo"
}

function Format-FileSize([long]$bytes) {
  if ($bytes -lt 1024) { return "$bytes B" }
  if ($bytes -lt 1048576) { return "{0:N1} KB" -f ($bytes / 1024) }
  "{0:N1} MB" -f ($bytes / 1048576)
}

function Resolve-InputPaths {
  if ($Paths -and $Paths.Count -gt 0) {
    return $Paths | ForEach-Object { Normalize-RepoPath $_ }
  }
  $names = git show --name-only --pretty=format: $Commit 2>$null
  if (-not $names) { return @() }
  $names |
    Where-Object { $_ -match "^downloads/.+\.(exe|msi|zip|7z)$" } |
    ForEach-Object { Normalize-RepoPath $_ }
}

function Write-RegistrationBlock($repoPath, $gh, $pagesBase) {
  $fullPath = Join-Path $repoRoot ($repoPath -replace "/", [IO.Path]::DirectorySeparatorChar)
  $fileName = Split-Path $repoPath -Leaf
  $sizeLabel = ""
  if (Test-Path -LiteralPath $fullPath) {
    $fi = Get-Item -LiteralPath $fullPath
    $sizeLabel = Format-FileSize $fi.Length
  }

  $downloadUrl = Get-MediaDownloadUrl $gh.Owner $gh.Repo $gh.Branch $repoPath
  $blobUrl = "https://github.com/$($gh.Owner)/$($gh.Repo)/blob/$($gh.Branch)/$repoPath"
  $id = if ($UtilityId) { $UtilityId } else { "YOUR-UTILITY-ID" }
  $name = if ($UtilityName) { $UtilityName } else { "Program name" }

  $windows = [ordered]@{
    file     = $repoPath
    fileName = $fileName
    fileSize = $sizeLabel
  }
  $jsonObj = [ordered]@{
    id          = $id
    name        = $name
    description = "Short description"
    updatedAt   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    windows     = $windows
  }
  $json = $jsonObj | ConvertTo-Json -Depth 4

  $line = "----------------------------------------"
  Write-Host ""
  Write-Host $line -ForegroundColor Cyan
  Write-Host "  $fileName" -ForegroundColor White
  Write-Host $line -ForegroundColor Cyan
  Write-Host ""
  Write-Host "[1] Admin manual path (Git LFS direct upload field)" -ForegroundColor Yellow
  Write-Host "    $repoPath"
  Write-Host ""
  Write-Host "[2] Public download URL (catalog button / test)" -ForegroundColor Yellow
  Write-Host "    $downloadUrl"
  Write-Host ""
  Write-Host "[3] View on GitHub" -ForegroundColor Yellow
  Write-Host "    $blobUrl"
  Write-Host ""
  Write-Host "[4] data.json snippet (catalog + feedback board dropdown)" -ForegroundColor Yellow
  Write-Host "    Edit data/data.json utilities[] or save in admin:"
  Write-Host $json
  Write-Host ""
  Write-Host "[5] Quick links" -ForegroundColor Yellow
  Write-Host "    Admin:     $pagesBase/admin.html"
  Write-Host "    Catalog:   $pagesBase/"
  Write-Host "    Feedback:  $pagesBase/index.html#feedback-write"
  Write-Host ""
  Write-Host "    Note: Feedback 'related program' list only shows utilities" -ForegroundColor DarkGray
  Write-Host "    with windows.file set in data.json (step 4 + Pages deploy)." -ForegroundColor DarkGray
  Write-Host ""
}

$gh = Read-GithubConfig
if ($Owner) { $gh.Owner = $Owner }
if ($Repo) { $gh.Repo = $Repo }
if ($Branch) { $gh.Branch = $Branch }

$pagesBase = Get-PagesBaseUrl $gh.Owner $gh.Repo
$resolved = @(Resolve-InputPaths | Select-Object -Unique)

if (-not $resolved -or $resolved.Count -eq 0) {
  Write-Host "HyoT: no downloads/ files in this commit." -ForegroundColor DarkGray
  Write-Host "  Example: .\scripts\print-download-links.ps1 -Paths downloads/MyApp-1.0.0.exe"
  exit 0
}

Write-Host ""
Write-Host ("HyoT: registration links ({0} file(s))" -f $resolved.Count) -ForegroundColor Green

foreach ($p in $resolved) {
  Write-RegistrationBlock $p $gh $pagesBase
}

Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host "After push: wait for GitHub Actions Pages deploy (few minutes)." -ForegroundColor DarkGray
Write-Host "----------------------------------------" -ForegroundColor Cyan
Write-Host ""
