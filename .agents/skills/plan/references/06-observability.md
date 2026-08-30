# Observability & Time Handling Patterns

Guidelines for logging, diagnostics, error tracing, and time zone management.

---

## 1. Structured Logging & Auditing

Do not install complex third-party APM solutions when ASP.NET Core built-in logging and database auditing exist.

### Existing Patterns:
- **`ILogger<T>`**: Inject `ILogger<T>` into controllers and services. Use structured log templates with named parameters rather than string concatenation:
  ```csharp
  _logger.LogInformation("Booking created for guest {GuestEmail} with Reference {Reference}", booking.GuestEmail, booking.Reference);
  ```
- **`SystemAuditRecorder.cs`**: Log high-value administrative and booking security events directly to the database audit table for compliance and history tracking.

---

## 2. Time Zone Bugs & Manila Local Time Handling

Hotel stay dates and check-in/check-out times are sensitive to time zones.

### Existing Pattern in Repository:
- **Database Storage**: Always store timestamps in UTC (`DateTime.UtcNow`).
- **JSON Serialization**: `UtcDateTimeJsonConverter.cs` enforces UTC formatting on API boundaries.
- **Display Conversion**: Use `PhilippinesTime.cs` helper methods to convert UTC dates to Manila time (`Asia/Manila` / UTC+8) for display on booking receipts, invoices, and guest notifications.
