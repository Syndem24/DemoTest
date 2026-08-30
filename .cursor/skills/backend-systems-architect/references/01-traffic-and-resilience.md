# Traffic and resilience

Default: one process, modest traffic. Use ASP.NET built-ins. Do not add a gateway, Redis, or Polly unless asked.

## Rate limiting

**Use when:** guest book/create is being hammered.

**Here:** `Program.cs` already has `AddRateLimiter` policy `guest-bookings` (5 POSTs / IP / minute). Apply that policy to new guest-facing write endpoints; don't invent a second limiter.

**Don't:** token-bucket libraries, API gateways, WAFs for this.

## Idempotency

**Use when:** a retried POST would create a second booking, payment, or OCR charge.

**Here:** unique `Booking.Reference`; for client retries, accept an idempotency key and return the original result. Keep it in SQL, not Redis.

**Don't:** "just catch the error" without making the write safe to replay.

## Timeouts, retries, backoff

**Use when:** calling Azure Document Intelligence or another HTTP API.

**Here:** wrap OCR in `AzureReceiptOcrService` — short timeout, few retries with backoff, then the existing local fallback. Honor `CancellationToken`. Do not retry guest `CreateAsync` blindly (that's a double-book risk — pair with idempotency).

**Don't:** unbounded retries; retrying non-idempotent booking creates; a circuit-breaker package for one client.

## Circuit breaker / bulkhead

**Use when:** a dependency is down and would exhaust threads (not the current shape of this app).

**Here:** OCR already has quota/fallback. Prefer fail-fast + fallback over a breaker framework.

**Don't:** bulkheads and breakers around SQL — fix the query instead.

## Caching

**Use when:** the same room-type catalog is read constantly and is safe to be slightly stale.

**Here:** `IMemoryCache` in-process, short TTL, invalidate on room-type writes. Availability for a stay window is **not** a good cache — it is contention-sensitive (see 03).

**Don't:** Redis, CDNs, or cache-aside for booking availability.

## Load balancers / reverse proxies / API gateways

Out of scope. One Kestrel app. Don't add YARP, nginx, or a gateway "for architecture."
