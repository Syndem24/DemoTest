# Operations: single-instance deploy + SQL backup/restore

Mori International Hotel is **one property, one ASP.NET Core process, one SQL Server**.

## Single-instance (required)

In-process pieces that break under a second instance:

- ASP.NET session + distributed memory cache
- Rate limiters
- SignalR hubs (no Redis backplane)
- `AutomaticCheckoutBackgroundService` / `OfferExpiryWarningBackgroundService`
- Receipt and room images under `wwwroot/uploads`
- OCR / chat usage counters under `App_Data`

**Enforcement:** `Hosting:EnforceSingleInstance` (default `true`) runs `SingleInstanceGuardHostedService`, which takes a SQL `sp_getapplock` (`MoriInternationalHotel.SingleInstance`) for the process lifetime. A second process fails fast.

Set `Hosting:EnforceSingleInstance` to `false` only for deliberate local experiments — never in production.

## Health

- `GET /health` — app + SQL ping  
- `GET /health/ready` — SQL readiness tag  

Put a reverse proxy check on `/health` or `/health/ready`.

## Config / secrets

| Setting | Committed default | Local / prod |
|---------|-------------------|--------------|
| `ConnectionStrings:DefaultConnection` | LocalDB `Database=MoriHotel` (no personal path) | Override with env `ConnectionStrings__DefaultConnection` or `dotnet user-secrets` |
| `PublicBaseUrl` | empty in `appsettings.json` | Set in Development or production env to the public origin |
| `Identity:AllowBootstrapSeed` | **false** | Development sets `true` for first-run only |

First-run admin password (when seed is enabled) is written to  
`%LocalAppData%\MoriInternationalHotel\first-run-admin.txt` — **never logged**.

## Backup / restore

Script: `scripts/backup-restore-database.ps1`

```powershell
# Validate paths + write evidence (no sqlcmd required)
.\scripts\backup-restore-database.ps1 -Action DryRun

# Requires sqlcmd on PATH
.\scripts\backup-restore-database.ps1 -Action Backup
.\scripts\backup-restore-database.ps1 -Action Restore -BackupPath .\backups\MoriHotel-yyyyMMdd-HHmmss.bak
```

**RPO:** last successful backup. Schedule Backup to match how much guest/payment data you can afford to lose.  
**RTO:** stop the single app instance → Restore → start one instance → confirm `/health`.

Also back up `wwwroot/uploads` (receipts/room photos) separately — they are not inside SQL.

## CI

`.github/workflows/ci.yml` builds the project (`SkipSpaBuild=true`) and checks bootstrap seed off, no personal DB path, SpecialOffers antiforgery, and `/health` mapping.
