# Security

Default: fix the vulnerability class in this app. Don't add a WAF, zero-trust mesh, or SBOM pipeline as a substitute.

## Injection and XSS

**Here:** EF Core parameterized queries only — no SQL string concatenation. Razor encodes by default; don't write `@Html.Raw` on guest input. APIs: FluentValidation on DTOs (`CreateBookingRequestValidator`, etc.).

**Don't:** a WAF in front of concatenated SQL.

## CSRF / CORS

**Here:** MVC forms use `AddAntiforgery` (`RequestVerificationToken`). JSON APIs from the same origin don't need a new CORS policy. Don't open CORS to `*` for admin APIs.

## AuthZ (admin vs guest)

**Use when:** role X must not see or change role Y's data.

**Here:** guest booking endpoints vs admin `/api/admin/...` and `/Rooms`. Enforce on the **server** (filter by booking id, staff cookie/auth). Don't hide buttons only.

**Don't:** a policy-as-code product. Simple staff vs guest split is enough unless the user asks for roles.

## Secrets

Connection string and Azure OCR key live in configuration, not source, not client JS, not logs. Use user secrets / env vars locally.

## Payments and PII

Receipt images and guest email/phone stay on the server (`LocalPaymentReceiptStorage`). Don't log full PAN/receipt images. Don't put PII in SignalR payloads beyond what the admin UI already shows.

## SSRF / upload

OCR and receipt upload: cap size (already `MaxBytes` in `AzureReceiptOcrService`), allow only expected content types, don't fetch URLs the client supplies.

## TLS / encryption theater

Dev may be HTTP localhost. Don't add custom at-rest encryption layers on SQL; SQL Server + HTTPS in non-dev (`UseHttpsRedirection` / HSTS already in `Program.cs`) is the line.

## Supply chain / IAM / JWT rotation

Out of scope unless the user is adding auth tokens. Don't introduce JWT "best practices" for an app that isn't using JWT.
