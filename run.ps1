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
Write-Host "Browser will open http://localhost:5288/Rooms" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

# Open the site once Kestrel is listening (does not block dotnet run).
Start-Job -ScriptBlock {
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:5288/" -UseBasicParsing -TimeoutSec 1
            if ($r.StatusCode -ge 200) {
                Start-Process "http://localhost:5288/Rooms"
                return
            }
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
} | Out-Null

Set-Location "$root\TestingDemo"
dotnet run --launch-profile TestingDemo --project TestingDemo.csproj