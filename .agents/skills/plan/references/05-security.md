# Security Patterns

Guidelines for authentication, authorization, secret storage, SQL injection prevention, CSRF, and payment/PII protection.

---

## 1. Secrets & Configuration Management

Never hardcode credentials or connection strings in source code.

### Existing Pattern
- Store secrets in `appsettings.json` (local dev) or Environment Variables / Azure Key Vault (production).
- Use `SecureConfigStore.cs` or `IOptions<TOptions>` to read strongly typed configuration settings.

---

## 2. SQL Injection Prevention

- Always use EF Core LINQ methods (`Where`, `FirstOrDefaultAsync`, etc.) which emit parameterized SQL.
- If raw SQL is required, use `FromSqlInterpolated` or `ExecuteSqlInterpolatedAsync` with interpolated parameters. Never concatenate strings into raw SQL strings.

---

## 3. Anti-Forgery & Form Security

- MVC forms must include `@Html.AntiForgeryToken()`.
- Controllers and Action methods handling state-changing POST/PUT requests must specify `[ValidateAntiForgeryToken]` or `[AutoValidateAntiforgeryToken]`.

---

## 4. Payment & PII Protection

- Do not store raw credit card numbers or CVVs in the hotel database.
- Payment processing flows in `PaymentService.cs` store transaction references or uploaded payment receipts (`LocalPaymentReceiptStorage`), not sensitive cardholder details.
- User passwords must be hashed using ASP.NET Core Identity password hashers.
