# Traffic & Resilience Patterns

Guidelines for managing load, flaky dependencies, duplicate submissions, and caching in a single-instance ASP.NET Core hotel monolith.

---

## 1. Rate Limiting & Flood Prevention

Prevent guest or bot spam without adding API gateways or cloud WAF infrastructure.

### Existing Pattern in Repository
- `AddRateLimiter` in `Program.cs` configured with policy `guest-bookings`.
- Use fixed window or token bucket limiters built into ASP.NET Core (`Microsoft.AspNetCore.RateLimiting`).

### When to Apply
- Guest booking submission endpoint (`POST /Booking/Create`).
- Payment receipt upload (`POST /Payment/UploadReceipt`).
- Authentication endpoints (login, password reset).

---

## 2. Flaky Third-Party Services (e.g., Azure Document Intelligence / OCR)

Avoid adding distributed message queues or Polly dependencies for simple third-party HTTP integrations.

### Pattern: Bounded Retry with Timeout & Fallback
- Use `CancellationTokenSource` with a tight timeout (e.g. 5–10 seconds) on `HttpClient` calls.
- Catch `TaskCanceledException` or `HttpRequestException`.
- Implement simple bounded inline retries (1–2 attempts max) or fall back immediately.
- Maintain a local manual verification queue or fallback service (`LocalPaymentReceiptStorage`) when external OCR fails.

---

## 3. Idempotency & Duplicate Request Guarding

Prevent duplicate bookings or double charges when a guest retries a network request or double-clicks a form.

### Pattern: Reference & Transactional Idempotency
- Unique Reference Generation: Assign a unique `BookingReference` on client form load or generate deterministically.
- Unique Index: Database index on `Booking.Reference` ensures DB-level protection against duplicates.
- Anti-Forgery Tokens: Form POSTs use `[ValidateAntiForgeryToken]` to block CSRF and automated replay scripts.

---

## 4. In-Memory Caching

Avoid Redis or memcached for single-process monoliths.

### Pattern: `IMemoryCache`
- Cache static or infrequently modified lookups (e.g., `InclusionCatalog`, room type metadata, static site settings).
- Use `IMemoryCache` with relative expiration (`SetAbsoluteExpiration`) or cancellation tokens for cache invalidation on admin edits.
