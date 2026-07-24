#Requires -Version 5.1
<#
.SYNOPSIS
  One-command run for the Hotel Booking demo (HTTP only — no HTTPS cert headaches).

.EXAMPLE
  .\run.ps1

.EXAMPLE
  .\run.ps1 -Setup
#>
param(
    [switch]$Setup
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

if ($Setup) {
    & "$root\scripts\setup-new-device.ps1"
}

# Free leftover app locks (file lock / old debug session) before start.
Get-Process -Name TestingDemo -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5288 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
        try { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } catch { }
    }
Start-Sleep -Milliseconds 500

Write-Host ""
Write-Host "Starting app at http://localhost:5288 ..." -ForegroundColor Cyan
Write-Host "Browser opens automatically when the server is ready." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

Set-Location "$root\TestingDemo"
$env:HOTEL_OPEN_BROWSER = "1"
dotnet run --launch-profile TestingDemo --project TestingDemo.csproj
