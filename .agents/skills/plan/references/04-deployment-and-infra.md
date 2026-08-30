# Deployment & Infrastructure Patterns

Guidelines for database initialization, health monitoring, zero-downtime rollouts, and infrastructure choices for single-property monoliths.

---

## 1. Monolith Deployment Model

Mori International Hotel runs on a single server / single process (IIS or Kestrel) connected to a single SQL Server database instance.

### Rules:
- Avoid adding Kubernetes manifests, Helm charts, service meshes (Istio/Linkerd), or API gateways.
- Keep deployments simple and single-binary or single-publish folder.

---

## 2. Database Migration & Startup Bootstrapping

### Existing Pattern
- `DatabaseBootstrap.cs` checks and initializes required schema or default records at application startup.
- `AdminManagerSeed.cs` creates initial admin and staff credentials if missing.
- EF Core `MigrateAsync()` applies pending migrations programmatically during app startup in production.

---

## 3. Health Checks & Monitoring

### ASP.NET Core Built-in Health Checks
- Register health checks in `Program.cs`: `builder.Services.AddHealthChecks().AddDbContextCheck<ApplicationDbContext>();`
- Map endpoint: `app.MapHealthChecks("/health");`
- Expose single health endpoint for IIS or external ping services without adding external monitoring agents.
