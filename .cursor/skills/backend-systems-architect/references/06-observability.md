# Observability and time

Default: `ILogger` + precise exceptions. Do not add OpenTelemetry, App Insights, or an APM unless asked.

## Logging

Log **what failed and which booking/reference**, not giant object dumps. Use existing logger patterns (`AutomaticCheckoutBackgroundService`, OCR service). Never log OCR API keys or raw receipt bytes.

Guest-facing errors stay in `BookingAvailabilityException` / validation messages. Staff-facing conflicts stay in `BookingConcurrencyException`. Don't turn those into generic 500s.

## "Why is it slow"

Check in this order: N+1 / missing index (file 02), then a blocked serializable transaction (file 03), then a synchronous Azure OCR/PDF call on the request thread. Don't start with distributed tracing.

## Time (this app's real footgun)

Store `DateTime` UTC in SQL (`CheckInAtUtc`, `CheckoutTimeUtc`). Convert at the edge with `PhilippinesTime`. Stay-fee night counts are Manila **calendar** dates (see stay-fees skill) — not `Ceiling(TotalDays)`.

Clock skew, NTP, and multi-region time are out of scope. Wrong local offset is almost always a missing `PhilippinesTime` call.

## Alerting / SLOs / error budgets

Out of scope. Don't invent SLO dashboards. If something must be visible, an admin warning on the existing booking board is enough.

## Not this app

LLM gateways, prompt caching, vector/RAG infra, FinOps, platform engineering, gRPC, HTTP/3, serverless cold starts — do not introduce them.
