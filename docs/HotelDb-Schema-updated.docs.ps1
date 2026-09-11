#Requires -Version 5.1
<#
.SYNOPSIS
  Regenerates HotelDb schema documentation from the current model guide.

.DESCRIPTION
  Runs docs/generate-hoteldb-schema-doc.py which writes:
    - docs/HotelDb-Schema-updated.docx (always; also tries HotelDb-Schema.docx)
  Keep docs/HotelDb-Schema.md in sync as the markdown source of truth.
#>
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Invoke-Python([string]$script) {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        & $pyLauncher.Source -3 $script
        if ($LASTEXITCODE -ne 0) { throw "Python exited $LASTEXITCODE" }
        return
    }
    foreach ($name in @("python", "python3")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd -and $cmd.Source -notmatch 'WindowsApps') {
            & $cmd.Source $script
            if ($LASTEXITCODE -ne 0) { throw "Python exited $LASTEXITCODE" }
            return
        }
    }
    throw "Python 3 is required. Install from https://www.python.org/ or enable the py launcher."
}

Write-Host "==> Generating HotelDb schema docx..." -ForegroundColor Cyan
Invoke-Python (Join-Path $root "generate-hoteldb-schema-doc.py")


$updated = Join-Path $root "HotelDb-Schema-updated.docx"
$primary = Join-Path $root "HotelDb-Schema.docx"
if (Test-Path $updated) { Write-Host "Created: $updated" -ForegroundColor Green }
if (Test-Path $primary) { Write-Host "Created: $primary" -ForegroundColor Green }
Write-Host "Markdown source: $(Join-Path $root 'HotelDb-Schema.md')"
