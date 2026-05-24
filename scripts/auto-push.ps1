# HyoT - auto commit and push to origin/main
param(
  [switch]$PushOnly,
  [string]$Message = ""
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot
$env:GIT_EDITOR = "true"

function Write-Log([string]$text) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$stamp] auto-push: $text"
}

if ((Test-Path ".git/rebase-merge") -or (Test-Path ".git/rebase-apply") -or (Test-Path ".git/MERGE_HEAD")) {
  Write-Log "skip: rebase or merge in progress"
  exit 0
}

$branch = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $branch) {
  Write-Log "error: not a git repository"
  exit 1
}

if ($branch -ne "main") {
  Write-Log "skip: branch is $branch (main only)"
  exit 0
}

if (-not $PushOnly) {
  $status = git status --porcelain
  if ($status) {
    git add -A
    $commitMsg = if ($Message) { $Message } else { "chore: auto-sync $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
    git commit -m $commitMsg
    Write-Log "committed"
  } else {
    Write-Log "nothing to commit"
  }
}

$upstream = git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
if (-not $upstream) {
  Write-Log "skip: no upstream"
  exit 0
}

$ahead = [int](git rev-list --count "@{u}..HEAD" 2>$null)
if ($ahead -eq 0 -and $PushOnly) {
  Write-Log "nothing to push"
  exit 0
}

Write-Log "pushing to origin/$branch"
git push origin $branch 2>&1 | Out-Host
if ($LASTEXITCODE -eq 0) {
  Write-Log "done"
  exit 0
}

Write-Log "push rejected, rebasing"
git pull --rebase origin $branch 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Log "rebase failed - resolve manually"
  exit 1
}

git push origin $branch 2>&1 | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Log "push failed"
  exit 1
}

Write-Log "done"
