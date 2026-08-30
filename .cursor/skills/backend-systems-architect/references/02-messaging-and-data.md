# Messaging and data

Default: same SQL transaction for booking + items + charges. Same process for delayed work. SignalR for admin live updates.

## Background work

**Use when:** the HTTP request shouldn't wait (auto-checkout, arrival/pending-call warnings).

**Here:** extend `AutomaticCheckoutBackgroundService` or add another `BackgroundService` registered in `Program.cs`. Scoped `DbContext` per iteration (`IServiceScopeFactory`).

**Don't:** Hangfire, RabbitMQ, Azure Service Bus, or `Channel<T>` spanning processes.

## Realtime

**Use when:** admin booking lists/notifications must update without refresh.

**Here:** `BookingNotificationsHub` at `/hubs/bookings`. Publish from API controllers the same way existing booking/payment actions do.

**Don't:** a second websocket stack, SSE, or polling loops unless SignalR is the wrong tool for that screen.

## One business operation, several tables

**Use when:** create booking, assign rooms, record payment, or replace charges must all succeed or all fail.

**Here:** `BeginTransactionAsync` in `BookingService` / `PaymentService` (create already uses `Serializable`). Keep logic in the service, not the controller.

**Don't:** saga, outbox, or 2PC. There is one database.

## "Keep two systems in sync"

**Use when:** the user actually has a second system (email, PDF flush, OCR).

**Here:** write SQL first, then the side effect; on failure, log and surface a retryable error. For email-like work, a `BackgroundService` pickup is enough.

**Don't:** transactional outbox + message bus for this monolith.

## Schema changes

**Use when:** new columns/tables for bookings, charges, payments.

**Here:** EF migration **and** `DatabaseBootstrap` if startup must create/patch the table (see stay-fees / `EnsureBookingChargeTable`). Expand-contract: add nullable/new column, backfill, then enforce required — don't rename in place on a live DB.

**Don't:** drop-and-recreate; don't only edit the snapshot.

## Indexes, N+1, pooling

**Use when:** list/availability queries are slow.

**Here:** look at `HotelBookingDbContext` indexes first (`IsArchived+Status+dates`, `Reference`, assignment pairs). Fix N+1 with `Include` / projection. SQL Server pooling is already on via `UseSqlServer`.

**Don't:** read replicas, sharding, partitioning, or "add Redis" for a missing index.

## CQRS / event sourcing / cron

Out of scope. Admin "history" is `IsArchived`, not an event store. Scheduled work is the existing hosted service, not a cron cluster.
