---
name: plan
description: >-
  Selects the smallest backend pattern for this hotel monolith before writing
  ASP.NET Core / EF Core / SQL Server code. Use when designing or changing API
  endpoints, booking or payment flows, background jobs, DB schema, concurrency,
  caching, retries, or deployments — even if no pattern is named. Infer the
  problem class (double-book → locking; slow side effects → background work).
  Also use for "what pattern should I use" and architecture trade-off reviews.
---

# Plan (Backend Systems Architect)

Pick 1–3 patterns that match this app's scale. Do not dump a catalog of distributed-systems ideas onto a single-database hotel.

## Scale (do not guess)

Mori International Hotel is **one property**, **one ASP.NET Core process**, **one SQL Server**. Prefer a transaction, unique index, `BackgroundService`, or `ILogger` over queues, sagas, meshes, and extra infrastructure.

## Core rule: select, don't dump

This skill exists to prevent both:

- **Under-engineering**: a retried book request double-books a room.
- **Over-engineering**: a saga + event bus for work that fits in one EF transaction.

Match the fix to actual failure modes — not to what would look impressive.

## Workflow — before any backend/infra code

1. **Restate the problem class**, not the ticket wording. "Two guests booked the same room" is concurrency/consistency, not "a booking bug."
2. **Open only the 1–2 reference files** that match that class.
3. **Shortlist 2–4 candidates**, then keep the smallest set that works here.
4. **State the choice and trade-off in one or two lines**, then code. Example: "Using the existing `Serializable` transaction in `BookingService.CreateAsync`; not adding a distributed lock."
5. **Implement with this stack's primitives** (table below). Do not import Hangfire, Redis, MassTransit, Polly, or a gateway unless the user asked for that dependency.
6. **Name what is out of scope.** "Not handling multi-region failover — one hotel, one database" is a useful sentence.

## Already in this repo — reuse before adding

| Need | Existing primitive |
|------|-------------------|
| Double-book / overlapping stay | `BeginTransactionAsync(IsolationLevel.Serializable)` in `BookingService.CreateAsync` |
| Conflicting admin updates | `BookingConcurrencyException` / `BookingAvailabilityException` |
| Uniqueness | EF unique indexes (`Room.RoomNumber`, `Booking.Reference`, assignment pairs) |
| Guest book flood | `AddRateLimiter` policy `guest-bookings` in `Program.cs` |
| Background work | `AutomaticCheckoutBackgroundService` (`BackgroundService`) |
| Live admin updates | SignalR `BookingNotificationsHub` (`/hubs/bookings`) |
| Validation | FluentValidation in `Validators/` |
| CSRF (MVC forms) | `AddAntiforgery` |
| Local time | `PhilippinesTime` — store UTC, display Manila |
| Schema | EF migration **and** `DatabaseBootstrap` when the table must exist on startup |
| Flaky third party | `AzureReceiptOcrService` — timeout/retry/fallback around OCR, not a new bus |

`RowVersion` was added then **dropped** on `Booking`. Do not reintroduce it unless the user asks.

## Anti-patterns

- Kubernetes, service mesh, GitOps, or multi-region for this app.
- A message queue when `BackgroundService` or an in-request service call is enough.
- Distributed locks when a unique index or the existing serializable transaction would do.
- Sagas, outbox, CQRS, or event sourcing for work that fits in one SQL transaction.
- New microservices with no team or scale boundary.
- Security theater (WAF, zero trust) while leaving string-concat SQL or secrets in source. Fix the real class first — see [references/05-security.md](references/05-security.md).
- New packages (Polly, Redis, Hangfire, MediatR) for a problem an existing primitive already covers.

## Reference index — open only what's relevant

| File | Open when the problem is |
|------|--------------------------|
| [references/01-traffic-and-resilience.md](references/01-traffic-and-resilience.md) | Flooding, retries, timeouts, flaky OCR, duplicate submits, caching |
| [references/02-messaging-and-data.md](references/02-messaging-and-data.md) | Background jobs, SignalR, schema, indexes, N+1, syncing two writes |
| [references/03-consistency-and-concurrency.md](references/03-consistency-and-concurrency.md) | Double-book, race on assign/checkout, unique constraints |
| [references/04-deployment-and-infra.md](references/04-deployment-and-infra.md) | Migrations, health, rollouts, "make it scale" |
| [references/05-security.md](references/05-security.md) | Auth, secrets, injection, CSRF, PII, payments |
| [references/06-observability.md](references/06-observability.md) | "Why is it slow/wrong", logging, time bugs |

## Symptom → concept → file

| Symptom | Likely concept | File |
|---------|----------------|------|
| Two guests grab the same room/type | Serializable txn + availability check + unique assignment | 03 |
| Retried POST creates a second booking | Idempotency (client key or unique reference) | 01 |
| Guest spam-submits the book form | Existing `guest-bookings` rate limiter | 01 |
| Azure OCR is slow/fails | Timeout, bounded retry, keep local fallback | 01 |
| Checkout/warnings shouldn't block a request | Existing `BackgroundService` | 02 |
| Admin list should update live | Existing SignalR hub | 02 |
| Reads miss indexes / N+1 | Index or `Include` — not a replica | 02 |
| Zero-downtime column change | Expand-contract migration | 02 |
| Secrets or SQL built from strings | Secrets + EF parameters | 05 |
| Wrong check-in day / "off by hours" | UTC storage + `PhilippinesTime` | 06 |
| Don't know why prod failed | `ILogger` + exception type — not a new APM | 06 |

If it doesn't map, restate the problem in one sentence. That usually names the file.
