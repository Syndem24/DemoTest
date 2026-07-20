#Requires -Version 5.1
<#
.SYNOPSIS
  Prepares a new Windows machine to run the Hotel Booking demo.

.PARAMETER ResetDatabase
  Drops HotelBookingDb so the app can recreate it from the single baseline migration.
#>
param(
    [switch]$ResetDatabase
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Checking .NET SDK..." -ForegroundColor Cyan
dotnet --info | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw ".NET SDK not found. Install .NET 9 SDK from https://dotnet.microsoft.com/download"
}

Write-Host "==> Checking / starting SQL LocalDB..." -ForegroundColor Cyan
$localDb = Get-Command sqllocaldb -ErrorAction SilentlyContinue
if (-not $localDb) {
    throw @"
SQL Server LocalDB was not found (sqllocaldb).

Install one of:
  - Visual Studio with 'ASP.NET and web development' / 'Data storage and processing'
  - SQL Server Express LocalDB standalone
  - SQL Server Express / Developer Edition (then update appsettings.json connection string)

Then re-run this script.
"@
}

sqllocaldb create mssqllocaldb 2>$null | Out-Null
sqllocaldb start mssqllocaldb

if ($ResetDatabase) {
    Write-Host "==> Dropping HotelBookingDb (local data will be removed)..." -ForegroundColor Yellow
    Add-Type -AssemblyName System.Data
    $master = "Server=(localdb)\mssqllocaldb;Trusted_Connection=True;TrustServerCertificate=True"
    $conn = New-Object System.Data.SqlClient.SqlConnection $master
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = @"
IF DB_ID(N'HotelBookingDb') IS NOT NULL
BEGIN
    ALTER DATABASE [HotelBookingDb] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [HotelBookingDb];
END
"@
    $cmd.ExecuteNonQuery() | Out-Null
    $conn.Close()
}

Write-Host "==> Restoring NuGet packages..." -ForegroundColor Cyan
dotnet restore "TestingDemo\TestingDemo.csproj"
if ($LASTEXITCODE -ne 0) { throw "dotnet restore failed." }

Write-Host "==> Building..." -ForegroundColor Cyan
dotnet build "TestingDemo\TestingDemo.csproj" -c Debug --no-restore
if ($LASTEXITCODE -ne 0) { throw "dotnet build failed." }

Write-Host @"

Setup complete.

Run the app:
  cd TestingDemo
  dotnet run

On first start the app applies the baseline migration and creates HotelBookingDb.

If migrations still fail, re-run:
  powershell -File scripts\setup-new-device.ps1 -ResetDatabase
"@ -ForegroundColor Green
