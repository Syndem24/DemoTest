# Deployment and infra

Default: run the MVC app, SQL Server, apply migrations. Do not introduce Kubernetes, Docker orchestration, or GitOps unless the user asks to deploy that way.

## Schema / app startup

**Here:** `DatabaseBootstrap.ApplyMigrations` runs at startup in `Program.cs`. New persisted features need an EF migration; if a table must exist even when migrations lag, add a bootstrap ensure-method (existing pattern for charges).

**Don't:** expand-contract skipped in favor of destructive edits; don't require a human to run SQL for a feature you added.

## Health / liveness

**Use when:** a reverse proxy must know the app is up.

**Here:** a simple `/health` that pings SQL is enough. Not required for local `http://localhost:5288`.

**Don't:** k8s probes, service meshes, or sidecar charts.

## Feature flags

**Use when:** shipping a risky guest flow that must turn off fast.

**Here:** `IConfiguration` / existing Options pattern (see `AzureDocumentIntelligenceOptions`). A bool in appsettings is a feature flag.

**Don't:** LaunchDarkly or a flag service.

## Scaling

Vertical (bigger SQL/app) first. Horizontal only if there are multiple app instances — then in-memory cache and in-process rate limits are **per node** (call that out; don't silently add Redis).

**Don't:** autoscaling, CDNs, or "add a replica" for this hotel.

## Rollouts / rollbacks

Prefer forward-fix + migration rollback plan. Blue-green/canary/chaos engineering are out of scope.

## Docker / IaC / CI

Only if the user asks. Don't add Dockerfiles, Terraform, or Helm to "complete the architecture."
