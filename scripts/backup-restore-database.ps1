#Requires -Version 5.1
<#
.SYNOPSIS
  Backup or restore the Mori Hotel SQL database (LocalDB / SQL Server).

.DESCRIPTION
  Uses sqlcmd BACKUP DATABASE / RESTORE DATABASE against ConnectionStrings:DefaultConnection
  (or -ConnectionString / -Database overrides).

.PARAMETER Action
  Backup | Restore | DryRun

.PARAMETER BackupPath
  Full path to .bak file. Default: .\backups\MoriHotel-yyyyMMdd-HHmmss.bak

.EXAMPLE
  .\scripts\backup-restore-database.ps1 -Action DryRun
  .\scripts\backup-restore-database.ps1 -Action Backup
  .\scripts\backup-restore-database.ps1 -Action Restore -BackupPath .\backups\MoriHotel-20260101-120000.bak
#>
param(
    [ValidateSet('Backup', 'Restore', 'DryRun')]
    [string]$Action = 'DryRun',

    [string]$ConnectionString = '',

    [string]$Database = '',

    [string]$BackupPath = '',

    [string]$ServerInstance = '(localdb)\mssqllocaldb'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Get-DefaultConnectionString {
    $settingsPath = Join-Path $root 'TestingDemo\appsettings.Development.json'
    $basePath = Join-Path $root 'TestingDemo\appsettings.json'
    $cs = $null
    foreach ($path in @($settingsPath, $basePath)) {
        if (-not (Test-Path $path)) { continue }
        $json = Get-Content -Raw $path | ConvertFrom-Json
        if ($json.ConnectionStrings.DefaultConnection) {
            $cs = [string]$json.ConnectionStrings.DefaultConnection
            if ($path -like '*Development*' -and $cs) { return $cs }
            if (-not $script:fallbackCs) { $script:fallbackCs = $cs }
        }
    }
    if ($env:ConnectionStrings__DefaultConnection) {
        return $env:ConnectionStrings__DefaultConnection
    }
    return $script:fallbackCs
}

function Get-DatabaseName([string]$cs, [string]$override) {
    if ($override) { return $override }
    if ($cs -match 'Database=([^;]+)') { return $Matches[1] }
    if ($cs -match 'Initial Catalog=([^;]+)') { return $Matches[1] }
    return 'MoriHotel'
}

$cs = if ($ConnectionString) { $ConnectionString } else { Get-DefaultConnectionString }
if (-not $cs) {
    throw 'No connection string. Set -ConnectionString or ConnectionStrings__DefaultConnection.'
}

$dbName = Get-DatabaseName $cs $Database
$backupDir = Join-Path $root 'backups'
if (-not $BackupPath) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $BackupPath = Join-Path $backupDir "$dbName-$stamp.bak"
}

Write-Host "Action:     $Action"
Write-Host "Database:   $dbName"
Write-Host "Server:     $ServerInstance"
Write-Host "BackupPath: $BackupPath"

$sqlcmd = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmd) {
    Write-Warning 'sqlcmd not found on PATH. DryRun can still validate paths; Backup/Restore require sqlcmd (SSMS / SQL tools).'
}

if ($Action -eq 'DryRun') {
    Write-Host ''
    Write-Host 'DryRun OK — would execute:'
    Write-Host "  BACKUP DATABASE [$dbName] TO DISK = N'$BackupPath' WITH INIT"
    Write-Host "  RESTORE DATABASE [$dbName] FROM DISK = N'$BackupPath' WITH REPLACE"
    Write-Host ''
    Write-Host 'RPO/RTO (ops contract):'
    Write-Host '  RPO: last successful backup (run Backup on a schedule you accept for guest/payment data).'
    Write-Host '  RTO: time to stop the app, Restore, start one app instance, confirm /health.'
    if (-not (Test-Path $backupDir)) {
        New-Item -ItemType Directory -Path $backupDir | Out-Null
        Write-Host "Created $backupDir"
    }
    # Evidence file for CI/local verification
    $evidence = Join-Path $backupDir 'last-dry-run.txt'
    $utc = (Get-Date).ToUniversalTime().ToString('o')
    @(
        "Utc=$utc"
        "Action=DryRun"
        "Database=$dbName"
        "BackupPath=$BackupPath"
        "Result=OK"
    ) -join [Environment]::NewLine | Set-Content -Path $evidence -Encoding UTF8
    Write-Host "Wrote evidence: $evidence"
    exit 0
}

if (-not $sqlcmd) {
    throw 'sqlcmd is required for Backup/Restore.'
}

# Prefer LocalDB start when targeting localdb
if ($ServerInstance -like '*localdb*') {
    $localDb = Get-Command sqllocaldb -ErrorAction SilentlyContinue
    if ($localDb) {
        sqllocaldb start mssqllocaldb 2>$null | Out-Null
    }
}

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

if ($Action -eq 'Backup') {
    $sql = "BACKUP DATABASE [$dbName] TO DISK = N'$BackupPath' WITH INIT, STATS = 10;"
    & sqlcmd -S $ServerInstance -E -Q $sql
    if ($LASTEXITCODE -ne 0) { throw "BACKUP failed (exit $LASTEXITCODE)." }
    if (-not (Test-Path $BackupPath)) { throw "Backup file was not created: $BackupPath" }
    Write-Host "Backup complete: $BackupPath"
    exit 0
}

if ($Action -eq 'Restore') {
    if (-not (Test-Path $BackupPath)) {
        throw "Backup file not found: $BackupPath"
    }
    $sql = @"
ALTER DATABASE [$dbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE [$dbName] FROM DISK = N'$BackupPath' WITH REPLACE, STATS = 10;
ALTER DATABASE [$dbName] SET MULTI_USER;
"@
    & sqlcmd -S $ServerInstance -E -Q $sql
    if ($LASTEXITCODE -ne 0) { throw "RESTORE failed (exit $LASTEXITCODE)." }
    Write-Host "Restore complete from: $BackupPath"
    exit 0
}
