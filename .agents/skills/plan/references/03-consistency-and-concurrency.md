# Consistency & Concurrency Patterns

Guidelines for preventing double-bookings, handling concurrent admin room assignments, and maintaining strict transactional integrity.

---

## 1. Double-Booking & Overlapping Stay Prevention

Do not introduce Redlock or distributed lock servers. Standard relational databases handle this reliably.

### Existing Pattern in Repository
- In `BookingService.CreateAsync`, execute availability checks and reservation creation inside an explicit transaction:
  ```csharp
  using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
  ```
- **Serializable Isolation**: Ensures concurrent booking requests for overlapping dates see accurate availability and block until completed.

---

## 2. Admin Concurrency & Race Conditions

When multiple staff members manage rooms or modify bookings simultaneously.

### Custom Exception Types in Repository
- `BookingConcurrencyException`: Thrown when a booking modification conflicts with another active update.
- `BookingAvailabilityException`: Thrown when a room or room category is no longer available during booking confirmation.

### Note on `RowVersion`
- `RowVersion` timestamp columns were previously tested and explicitly **dropped** on `Booking`.
- Do not reintroduce `RowVersion` or `byte[]` timestamp columns unless explicitly requested by the user.

---

## 3. Database-Enforced Uniqueness Constraints

Never rely solely on application-level checks for critical unique identifiers.

### Unique Indexes in EF Core
- Room Numbers: Unique index on `Room.RoomNumber`.
- Booking References: Unique index on `Booking.Reference`.
- Active Room Assignment Pairs: Compound unique constraint on `(RoomId, Date)` or assignment constraints to prevent room double-assignment.
