# Messaging & Data Patterns

Guidelines for background task processing, real-time admin updates, data querying, and database schema updates in ASP.NET Core & EF Core.

---

## 1. Background Jobs & Asynchronous Work

Do not import Hangfire, Quartz.NET, or RabbitMQ for internal background jobs.

### Existing Pattern: ASP.NET Core `BackgroundService`
- Examples in codebase: `AutomaticCheckoutBackgroundService`, `OfferExpiryWarningBackgroundService`.
- Implement long-running background tasks via `IHostedService` / `BackgroundService`.
- Scope Management: Inject `IServiceScopeFactory` to create an `IServiceScope` for scoped EF `DbContext` instances inside periodic loops.

---

## 2. Real-Time Admin & Guest Notifications

Do not use external message brokers or WebSockets libraries when SignalR is built-in.

### Existing Pattern: SignalR Hubs
- Example in codebase: `BookingNotificationsHub` mapped to `/hubs/bookings`.
- Notify connected admin dashboards instantly when new bookings are created or updated using `IHubContext<BookingNotificationsHub>`.

---

## 3. Query Optimization & N+1 Prevention

Avoid read replicas or caching layers for queries that can be solved with clean EF Core SQL.

### Patterns:
- **Eager Loading**: Explicitly call `.Include()` and `.ThenInclude()` for navigation properties to avoid N+1 query performance degradation.
- **Read-Only Queries**: Use `.AsNoTracking()` on administrative or reporting queries to skip EF change tracker overhead.
- **Selective Projection**: Use `.Select()` DTO projections to fetch only necessary columns rather than full entity graphs.

---

## 4. Database Bootstrap & Expand-Contract Schema Changes

### Schema Management:
- Use EF Core migrations for versioned database schema updates.
- Use `DatabaseBootstrap` for startup validation or default seed data checks (`AdminManagerSeed.cs`).
- Perform zero-downtime column changes using the **Expand-Contract Pattern**:
  1. Expand: Add new column without removing old column; write to both.
  2. Migrate: Backfill historical records.
  3. Contract: Remove old column in a subsequent deployment.
