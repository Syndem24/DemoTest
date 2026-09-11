#Requires -Version 5.1
<#
.SYNOPSIS
  Regenerates docs/Hotel-Use-Cases.docx (full hotel system use cases + diagrams).

.DESCRIPTION
  Builds and runs docs/UseCaseDocGen (Open XML). Replaces the older
  Room-Management-only document.
#>
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$proj = Join-Path $root "UseCaseDocGen\UseCaseDocGen.csproj"
$outDoc = Join-Path $root "Hotel-Use-Cases.docx"

Write-Host "==> Building UseCaseDocGen..." -ForegroundColor Cyan
dotnet run --project $proj -c Release
if ($LASTEXITCODE -ne 0) { throw "UseCaseDocGen failed." }

if (-not (Test-Path $outDoc)) {
    throw "Expected output missing: $outDoc"
}

Write-Host "Created: $outDoc" -ForegroundColor Green
Write-Host "Open Hotel-Use-Cases.docx for guest, rooms, bookings, payments, offers, auth, and ops use cases."
