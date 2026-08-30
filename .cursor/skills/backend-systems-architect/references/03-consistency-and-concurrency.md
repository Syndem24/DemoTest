# Consistency and concurrency

Default: one SQL Server. Prevent double-book with a **transaction + availability check + unique assignment**, not a distributed lock.

## Overlapping bookings (the main hotel case)

**Use when:** two guests can take the last room of a type for the same dates, or two staff assign the same room.

**Here:**

1. Keep `CreateAsync` inside `IsolationLevel.Serializable` and re-check availability before insert (`BookingService`).
2. Enforce uniqueness on `AssignedRoom` (`BookingItemId+RoomId`) and `Room.RoomNumber`.
3. Throw `BookingAvailabilityException` (guest-visible) or `BookingConcurrencyException` (admin conflict) — controllers already translate these.

**Don't:** Redis locks, `sp_getapplock` as a first choice, or "check availability in the controller then save."

## Optimistic vs pessimistic

**Optimistic (row version / `DbUpdateConcurrencyException`):** fine for low-contention admin edits (guest name, fees) if the user asks. `RowVersion` on `Booking` was **removed** in `DatabaseBootstrap` — do not put it back unless asked.

**Pessimistic (serializable / `UPDLOCK`):** already the create/availability path. Prefer this for "last room" contention.

## Unique constraints vs app checks

App checks are UX; unique indexes are the real guard. If a race can insert duplicates, add the index (reference, room number, assignment pair). Catch the SQL unique violation and return a concurrency/availability error.

## Race on status transitions

Confirm / assign / checkout / archive are state machines. Load the booking **inside** the transaction, reject illegal statuses with `BookingConcurrencyException` (already the pattern in `BookingService`). Don't "read, then later write" without a transaction.

## Deadlocks / thread safety

Keep transactions short. Don't hold a transaction while calling Azure OCR or building PDFs. `DbContext` is not thread-safe — one context per request/scope.

## Distributed locks / CAP / eventual consistency

Out of scope. There is no second region and no second source of truth. If something looks eventually consistent, it is usually a missing transaction.
