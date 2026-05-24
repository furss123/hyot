$ErrorActionPreference = "Stop"
$size = 50 * 1024 * 1024
$root = Split-Path $PSScriptRoot -Parent
$downloads = Join-Path $root "downloads"

$items = @(
  @{ file = "hyot-excel-merge-v1.2.exe" },
  @{ file = "hyot-pdf-stamp-v2.0.exe" },
  @{ file = "hyot-image-batch-v3.1.exe" },
  @{ file = "hyot-log-analyzer-v1.0.exe" },
  @{ file = "hyot-csv-toolkit-v2.4.exe" },
  @{ file = "hyot-folder-sync-v1.5.exe" },
  @{ file = "hyot-text-diff-v1.1.exe" },
  @{ file = "hyot-screen-ocr-v2.2.exe" },
  @{ file = "hyot-backup-scheduler-v1.3.exe" }
)

foreach ($item in $items) {
  $path = Join-Path $downloads $item.file
  if (Test-Path $path) { Remove-Item $path -Force }
  fsutil file createnew $path $size | Out-Null
  Write-Host "Created $path ($size bytes)"
}
