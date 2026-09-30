using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using QRCoder;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>Tiny health counters for the Integrations page (same shape as EmailSendTelemetry).</summary>
public sealed class XenditTelemetry
{
    private readonly object _gate = new();
    private DateTime? _lastOkUtc;
    private DateTime? _lastErrorUtc;
    private string? _lastError;
    private DateTime? _lastWebhookUtc;

    public DateTime? LastSuccessUtc { get { lock (_gate) return _lastOkUtc; } }
    public DateTime? LastErrorUtc { get { lock (_gate) return _lastErrorUtc; } }
    public string? LastError { get { lock (_gate) return _lastError; } }
    public DateTime? LastWebhookUtc { get { lock (_gate) return _lastWebhookUtc; } }

    public void RecordOk()
    {
        lock (_gate) _lastOkUtc = DateTime.UtcNow;
    }

    public void RecordError(string message)
    {
        lock (_gate)
        {
            _lastErrorUtc = DateTime.UtcNow;
            var trimmed = (message ?? string.Empty).Trim();
            _lastError = trimmed.Length > 200 ? trimmed[..200] : trimmed;
        }
    }

    public void RecordWebhook()
    {
        lock (_gate) _lastWebhookUtc = DateTime.UtcNow;
    }
}

/// <summary>Xendit returned a non-2xx response; carries its error_code/message for staff.</summary>
public sealed class XenditApiException : HttpRequestException
{
    public int StatusCode { get; }
    public string ErrorCode { get; }

    public XenditApiException(int statusCode, string errorCode, string message)
        : base(message)
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }
}

public interface IXenditQrPaymentService
{
    Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default);
    /// <summary>Id of a still-open Pending intent for the booking, if any (for "Show QRPh").</summary>
    Task<int?> GetPendingIntentIdAsync(int bookingId, CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto> CreateAsync(
        int bookingId, decimal amount, string createdBy, CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto?> GetAsync(
        int intentId, bool reconcile, CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto> CancelAsync(int intentId, CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto> SimulateAsync(int intentId, CancellationToken cancellationToken = default);
    /// <summary>Returns false only when the callback token does not match the vault token.</summary>
    Task<bool> HandleWebhookAsync(
        string? callbackToken, JsonDocument body, CancellationToken cancellationToken = default);
    /// <summary>Guest deposit checkout: create (or reuse) an open intent on the QRPh or Card channel.</summary>
    Task<QrPaymentIntentDto> CreateGuestDepositAsync(
        int bookingId, string payToken, XenditChannel channel, string originBaseUrl,
        CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto?> GetGuestAsync(
        int bookingId, int intentId, string payToken, bool reconcile,
        CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto?> GetCurrentGuestAsync(
        int bookingId, string payToken, CancellationToken cancellationToken = default);
    /// <summary>Same as GetCurrentGuestAsync but resolves the booking by its public reference.</summary>
    Task<QrPaymentIntentDto?> GetCurrentGuestByReferenceAsync(
        string reference, string payToken, CancellationToken cancellationToken = default);
    Task<QrPaymentIntentDto> CancelGuestAsync(
        int bookingId, int intentId, string payToken, CancellationToken cancellationToken = default);
    /// <summary>Xendit Invoice (hosted card checkout) callback. Same token contract as HandleWebhookAsync.</summary>
    Task<bool> HandleInvoiceWebhookAsync(
        string? callbackToken, JsonDocument body, CancellationToken cancellationToken = default);
    /// <summary>Best-effort cancel of all open intents for a booking (deposit hold released).</summary>
    Task ExpireStaleIntentsAsync(int bookingId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Xendit Payments API v3 QRPh intents for walk-in/front-desk collection.
/// Xendit secrets live only in the secure vault — never in appsettings or logs.
/// </summary>
public sealed class XenditQrPaymentService : IXenditQrPaymentService
{
    private const decimal MinAmount = 1.00m;
    private const decimal MaxAmount = 50_000m;

    private readonly HotelBookingDbContext _db;
    private readonly ISecureConfigStore _vault;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IPaymentService _paymentService;
    private readonly ISystemAuditRecorder _audit;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;
    private readonly IGuestCatalogNotifier _guestCatalog;
    private readonly XenditTelemetry _telemetry;
    private readonly ILogger<XenditQrPaymentService> _logger;

    public XenditQrPaymentService(
        HotelBookingDbContext db,
        ISecureConfigStore vault,
        IHttpClientFactory httpClientFactory,
        IPaymentService paymentService,
        ISystemAuditRecorder audit,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub,
        IGuestCatalogNotifier guestCatalog,
        XenditTelemetry telemetry,
        ILogger<XenditQrPaymentService> logger)
    {
        _db = db;
        _vault = vault;
        _httpClientFactory = httpClientFactory;
        _paymentService = paymentService;
        _audit = audit;
        _hub = hub;
        _guestCatalog = guestCatalog;
        _telemetry = telemetry;
        _logger = logger;
    }

    public async Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default)
    {
        var hasKey = await _vault.HasValueAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
        var hasToken = await _vault.HasValueAsync(SecureSettingKeys.XenditWebhookToken, cancellationToken);
        return hasKey && hasToken;
    }

    public async Task<int?> GetPendingIntentIdAsync(
        int bookingId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        return await _db.QrPaymentIntents
            .AsNoTracking()
            .Where(i => i.BookingId == bookingId
                && i.Status == QrPaymentIntentStatus.Pending
                && (i.ExpiresAtUtc == null || i.ExpiresAtUtc > now))
            .OrderByDescending(i => i.Id)
            .Select(i => (int?)i.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<QrPaymentIntentDto> CreateAsync(
        int bookingId, decimal amount, string createdBy, CancellationToken cancellationToken = default)
    {
        createdBy = createdBy?.Trim() ?? string.Empty;
        if (createdBy.Length < 2 || createdBy.Length > 120)
        {
            throw new ArgumentException("Staff identity is required to create a QR payment.");
        }

        var secretKey = await _vault.GetAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
        var webhookToken = await _vault.HasValueAsync(SecureSettingKeys.XenditWebhookToken, cancellationToken);
        if (string.IsNullOrWhiteSpace(secretKey) || !webhookToken)
        {
            throw new InvalidOperationException(
                "Xendit is not connected. Add the API key and webhook token on the Integrations page.");
        }

        var booking = await _db.Bookings
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == bookingId, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new ArgumentException("Archived bookings cannot take new payments.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new ArgumentException(
                "Confirm the booking first. Payments can only be recorded after confirmation.");
        }

        if (booking.CashOnlyPromo)
        {
            throw new ArgumentException("This stay used a cash-only promo. Record payment as Cash.");
        }

        var now = DateTime.UtcNow;
        var existing = await _db.QrPaymentIntents
            .AsNoTracking()
            .Where(i => i.BookingId == bookingId
                && i.Status == QrPaymentIntentStatus.Pending
                && (i.ExpiresAtUtc == null || i.ExpiresAtUtc > now))
            .OrderByDescending(i => i.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (existing is not null)
        {
            return Map(existing, booking, null);
        }

        var rounded = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        if (rounded < MinAmount || rounded > MaxAmount)
        {
            throw new ArgumentException($"QRPh amount must be between {money(MinAmount)} and {money(MaxAmount)}.");
        }

        var postedPaid = await _db.PaymentRecords
            .Where(p => p.BookingId == bookingId && p.Status == PaymentRecordStatus.Posted)
            .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;
        var balanceDue = decimal.Round(booking.TotalAmount - postedPaid, 2, MidpointRounding.AwayFromZero);
        if (rounded > balanceDue)
        {
            throw new ArgumentException(
                $"QRPh amount cannot exceed the balance due ({money(balanceDue)}).");
        }

        var intent = await CreateQrIntentCoreAsync(
            booking,
            rounded,
            PaymentEventType.ArrivalPayment,
            XenditChannel.QrPh,
            createdBy,
            secretKey,
            cancellationToken);

        return Map(intent, booking, null);
    }

    /// <summary>
    /// Create a Xendit QRPh payment_request and persist the Pending intent row.
    /// Shared by the staff front-desk path and the guest deposit picker.
    /// </summary>
    private async Task<QrPaymentIntent> CreateQrIntentCoreAsync(
        Booking booking,
        decimal amount,
        PaymentEventType eventType,
        XenditChannel channel,
        string createdBy,
        string secretKey,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var referenceId = NewReferenceId(booking);
        var payload = new
        {
            reference_id = referenceId,
            type = "PAY",
            country = "PH",
            currency = "PHP",
            channel_code = "QRPH",
            request_amount = amount,
            description = $"Mori International Hotel · {booking.Reference}",
            metadata = new
            {
                bookingId = booking.Id.ToString(),
                bookingReference = booking.Reference
            }
        };

        JsonElement root;
        try
        {
            root = await SendAsync(HttpMethod.Post, "v3/payment_requests", payload, secretKey, cancellationToken);
            _telemetry.RecordOk();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _telemetry.RecordError(ex.GetType().Name);
            _logger.LogWarning(ex, "Xendit create payment request failed for booking {BookingId}.", booking.Id);
            throw;
        }

        var paymentRequestId = root.TryGetProperty("payment_request_id", out var prId)
            ? prId.GetString() ?? string.Empty
            : string.Empty;
        if (string.IsNullOrWhiteSpace(paymentRequestId))
        {
            _telemetry.RecordError("missing_payment_request_id");
            throw new InvalidOperationException("Xendit did not return a payment request id.");
        }

        string? qrString = null;
        if (root.TryGetProperty("actions", out var actions) && actions.ValueKind == JsonValueKind.Array)
        {
            foreach (var action in actions.EnumerateArray())
            {
                if (action.TryGetProperty("descriptor", out var descriptor)
                    && string.Equals(descriptor.GetString(), "QR_STRING", StringComparison.OrdinalIgnoreCase))
                {
                    qrString = action.TryGetProperty("value", out var v) ? v.GetString() : null;
                    break;
                }
            }
        }

        if (string.IsNullOrWhiteSpace(qrString))
        {
            _telemetry.RecordError("missing_qr_string");
            throw new InvalidOperationException("Xendit did not return a QR string.");
        }

        DateTime? expiresAtUtc = null;
        if (root.TryGetProperty("channel_properties", out var channelProps)
            && channelProps.ValueKind == JsonValueKind.Object
            && channelProps.TryGetProperty("expires_at", out var expiresRaw)
            && expiresRaw.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(expiresRaw.GetString(), out var expiresAt))
        {
            expiresAtUtc = expiresAt.UtcDateTime;
        }

        var intent = new QrPaymentIntent
        {
            BookingId = booking.Id,
            ReferenceId = referenceId,
            XenditPaymentRequestId = paymentRequestId,
            EventType = eventType,
            Channel = channel,
            Amount = amount,
            Currency = "PHP",
            Status = QrPaymentIntentStatus.Pending,
            QrString = qrString,
            ExpiresAtUtc = expiresAtUtc,
            CreatedBy = createdBy,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            IsTestMode = secretKey.StartsWith("xnd_development_", StringComparison.Ordinal)
        };
        _db.QrPaymentIntents.Add(intent);
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Payment,
            "Payment.QrCreated",
            "QrPaymentIntent",
            intent.Id.ToString(),
            intent.ReferenceId,
            summary: $"QRPh intent {intent.ReferenceId} created for {booking.Reference} · ₱{amount:N2}.");
        await _db.SaveChangesAsync(cancellationToken);

        return intent;
    }

    private static string NewReferenceId(Booking booking)
    {
        return $"MORI-{booking.Reference}-{Guid.NewGuid():N}"[..Math.Min(64, 6 + booking.Reference.Length + 12)]
            .ToUpperInvariant();
    }

    public async Task<QrPaymentIntentDto?> GetAsync(
        int intentId, bool reconcile, CancellationToken cancellationToken = default)
    {
        var intent = await _db.QrPaymentIntents
            .AsNoTracking()
            .Include(i => i.Booking)
            .Include(i => i.PaymentRecord)
            .FirstOrDefaultAsync(i => i.Id == intentId, cancellationToken);
        if (intent is null)
        {
            return null;
        }

        if (reconcile && intent.Status == QrPaymentIntentStatus.Pending)
        {
            await ReconcileAsync(intent, cancellationToken);
            intent = await _db.QrPaymentIntents
                .AsNoTracking()
                .Include(i => i.Booking)
                .Include(i => i.PaymentRecord)
                .FirstAsync(i => i.Id == intentId, cancellationToken);
        }

        return Map(intent, intent.Booking, intent.PaymentRecord?.ReceiptNumber);
    }

    public async Task<QrPaymentIntentDto> CancelAsync(
        int intentId, CancellationToken cancellationToken = default)
    {
        var intent = await _db.QrPaymentIntents
            .Include(i => i.Booking)
            .Include(i => i.PaymentRecord)
            .FirstOrDefaultAsync(i => i.Id == intentId, cancellationToken)
            ?? throw new KeyNotFoundException("QR payment was not found.");

        await CancelIntentAsync(intent, cancellationToken);

        return Map(intent, intent.Booking, intent.PaymentRecord?.ReceiptNumber);
    }

    /// <summary>
    /// Local cancel wins; the remote cancel/expire is best-effort so Xendit can
    /// still expire on its own when the API is unreachable.
    /// </summary>
    private async Task CancelIntentAsync(QrPaymentIntent intent, CancellationToken cancellationToken)
    {
        if (intent.Status != QrPaymentIntentStatus.Pending)
        {
            return;
        }

        intent.Status = QrPaymentIntentStatus.Cancelled;
        intent.UpdatedAtUtc = DateTime.UtcNow;
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Payment,
            "Payment.QrCancelled",
            "QrPaymentIntent",
            intent.Id.ToString(),
            intent.ReferenceId,
            summary: $"QRPh intent {intent.ReferenceId} cancelled on {intent.Booking.Reference}.");
        await _db.SaveChangesAsync(cancellationToken);

        var secretKey = await _vault.GetAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            return;
        }

        try
        {
            if (intent.Channel == XenditChannel.Card)
            {
                if (!string.IsNullOrWhiteSpace(intent.XenditInvoiceId))
                {
                    await SendAsync(
                        HttpMethod.Post,
                        $"v2/invoices/{intent.XenditInvoiceId}/expire!",
                        null,
                        secretKey,
                        cancellationToken);
                }
            }
            else if (!string.IsNullOrWhiteSpace(intent.XenditPaymentRequestId))
            {
                await SendAsync(
                    HttpMethod.Post,
                    $"v3/payment_requests/{intent.XenditPaymentRequestId}/cancel",
                    null,
                    secretKey,
                    cancellationToken);
            }

            _telemetry.RecordOk();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException
            or XenditApiException)
        {
            _logger.LogWarning(
                ex, "Best-effort Xendit cancel failed for intent {IntentId}.", intent.Id);
        }
    }

    public async Task<QrPaymentIntentDto> CreateGuestDepositAsync(
        int bookingId,
        string payToken,
        XenditChannel channel,
        string originBaseUrl,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == bookingId, cancellationToken);
        EnsureGuestToken(booking, payToken);

        if (booking!.IsArchived)
        {
            throw new ArgumentException("Archived bookings cannot take new payments.");
        }

        if (booking.Status != BookingStatus.Pending)
        {
            throw new ArgumentException("This booking no longer needs a deposit.");
        }

        var now = DateTime.UtcNow;
        if (booking.DepositDueAtUtc is null || booking.DepositDueAtUtc <= now)
        {
            throw new ArgumentException("The 30-minute hold for this booking has ended.");
        }

        var secretKey = await _vault.GetAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
        var webhookToken = await _vault.HasValueAsync(SecureSettingKeys.XenditWebhookToken, cancellationToken);
        if (string.IsNullOrWhiteSpace(secretKey) || !webhookToken)
        {
            throw new InvalidOperationException(
                "Xendit is not connected. Add the API key and webhook token on the Integrations page.");
        }

        var postedPaid = await PostedPaidAsync(bookingId, cancellationToken);
        var amount = decimal.Round(booking.AmountDueNow - postedPaid, 2, MidpointRounding.AwayFromZero);
        if (amount <= 0m)
        {
            throw new ArgumentException("Deposit already received.");
        }

        var openIntents = await _db.QrPaymentIntents
            .Include(i => i.Booking)
            .Where(i => i.BookingId == bookingId
                && i.Status == QrPaymentIntentStatus.Pending
                && (i.ExpiresAtUtc == null || i.ExpiresAtUtc > now))
            .OrderByDescending(i => i.Id)
            .ToListAsync(cancellationToken);

        var sameChannel = openIntents.FirstOrDefault(i => i.Channel == channel);
        if (sameChannel is not null)
        {
            return Map(sameChannel, booking, null, BalanceDue(booking, postedPaid));
        }

        foreach (var other in openIntents.Where(i => i.Channel != channel))
        {
            await CancelIntentAsync(other, cancellationToken);
        }

        var intent = channel == XenditChannel.Card
            ? await CreateCardIntentCoreAsync(
                booking, amount, payToken, originBaseUrl, secretKey, cancellationToken)
            : await CreateQrIntentCoreAsync(
                booking, amount, PaymentEventType.Deposit, channel, "Guest online", secretKey, cancellationToken);

        return Map(intent, booking, null, BalanceDue(booking, postedPaid));
    }

    /// <summary>Xendit Invoice (hosted card checkout) intent for the guest deposit.</summary>
    private async Task<QrPaymentIntent> CreateCardIntentCoreAsync(
        Booking booking,
        decimal amount,
        string payToken,
        string originBaseUrl,
        string secretKey,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var referenceId = NewReferenceId(booking);
        var returnUrl =
            $"{originBaseUrl.TrimEnd('/')}/Booking/DepositReturn" +
            $"?ref={Uri.EscapeDataString(booking.Reference)}&t={Uri.EscapeDataString(payToken)}";

        var customer = new Dictionary<string, string>();
        if (!string.IsNullOrWhiteSpace(booking.GuestName))
        {
            customer["given_names"] = booking.GuestName.Trim();
        }
        if (!string.IsNullOrWhiteSpace(booking.GuestEmail))
        {
            customer["email"] = booking.GuestEmail.Trim();
        }
        if (!string.IsNullOrWhiteSpace(booking.GuestPhone))
        {
            customer["mobile_number"] = booking.GuestPhone.Trim();
        }

        var payload = new
        {
            external_id = referenceId,
            amount,
            currency = "PHP",
            description = $"Mori International Hotel · {booking.Reference} · 50% deposit",
            invoice_duration = Math.Max(
                60, (int)Math.Ceiling((booking.DepositDueAtUtc!.Value - now).TotalSeconds)),
            payment_methods = new[] { "CREDIT_CARD" },
            customer,
            success_redirect_url = $"{returnUrl}&r=success",
            failure_redirect_url = $"{returnUrl}&r=failed",
            metadata = new
            {
                bookingId = booking.Id.ToString(),
                bookingReference = booking.Reference
            }
        };

        JsonElement root;
        try
        {
            root = await SendAsync(HttpMethod.Post, "v2/invoices", payload, secretKey, cancellationToken);
            _telemetry.RecordOk();
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _telemetry.RecordError(ex.GetType().Name);
            _logger.LogWarning(ex, "Xendit create invoice failed for booking {BookingId}.", booking.Id);
            throw;
        }

        var invoiceId = root.TryGetProperty("id", out var idEl) ? idEl.GetString() : null;
        var checkoutUrl = root.TryGetProperty("invoice_url", out var urlEl) ? urlEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(invoiceId) || string.IsNullOrWhiteSpace(checkoutUrl))
        {
            _telemetry.RecordError("missing_invoice");
            throw new InvalidOperationException("Xendit did not return a checkout URL.");
        }

        DateTime? expiresAtUtc = null;
        if (root.TryGetProperty("expiry_date", out var expEl)
            && expEl.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(expEl.GetString(), out var expiresAt))
        {
            expiresAtUtc = expiresAt.UtcDateTime;
        }

        var intent = new QrPaymentIntent
        {
            BookingId = booking.Id,
            ReferenceId = referenceId,
            XenditPaymentRequestId = null,
            XenditInvoiceId = invoiceId,
            EventType = PaymentEventType.Deposit,
            Channel = XenditChannel.Card,
            Amount = amount,
            Currency = "PHP",
            Status = QrPaymentIntentStatus.Pending,
            QrString = null,
            CheckoutUrl = checkoutUrl,
            ExpiresAtUtc = expiresAtUtc,
            CreatedBy = "Guest online",
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            IsTestMode = secretKey.StartsWith("xnd_development_", StringComparison.Ordinal)
        };
        _db.QrPaymentIntents.Add(intent);
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Payment,
            "Payment.QrCreated",
            "QrPaymentIntent",
            intent.Id.ToString(),
            intent.ReferenceId,
            summary: $"Card invoice {intent.ReferenceId} created for {booking.Reference} · ₱{amount:N2}.");
        await _db.SaveChangesAsync(cancellationToken);

        return intent;
    }

    public async Task<QrPaymentIntentDto?> GetGuestAsync(
        int bookingId,
        int intentId,
        string payToken,
        bool reconcile,
        CancellationToken cancellationToken = default)
    {
        var intent = await _db.QrPaymentIntents
            .AsNoTracking()
            .Include(i => i.Booking)
            .Include(i => i.PaymentRecord)
            .FirstOrDefaultAsync(i => i.Id == intentId && i.BookingId == bookingId, cancellationToken);
        EnsureGuestToken(intent?.Booking, payToken);

        if (reconcile && intent!.Status == QrPaymentIntentStatus.Pending)
        {
            await ReconcileAsync(intent, cancellationToken);
            intent = await _db.QrPaymentIntents
                .AsNoTracking()
                .Include(i => i.Booking)
                .Include(i => i.PaymentRecord)
                .FirstAsync(i => i.Id == intentId, cancellationToken);
        }

        var postedPaid = await PostedPaidAsync(bookingId, cancellationToken);
        return Map(intent!, intent!.Booking, intent.PaymentRecord?.ReceiptNumber,
            BalanceDue(intent.Booking, postedPaid));
    }

    public async Task<QrPaymentIntentDto?> GetCurrentGuestAsync(
        int bookingId, string payToken, CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Id == bookingId, cancellationToken);
        EnsureGuestToken(booking, payToken);
        return await GetCurrentForBookingAsync(booking!, cancellationToken);
    }

    public async Task<QrPaymentIntentDto?> GetCurrentGuestByReferenceAsync(
        string reference, string payToken, CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .FirstOrDefaultAsync(b => b.Reference == reference, cancellationToken);
        EnsureGuestToken(booking, payToken);
        return await GetCurrentForBookingAsync(booking!, cancellationToken);
    }

    private async Task<QrPaymentIntentDto?> GetCurrentForBookingAsync(
        Booking booking, CancellationToken cancellationToken)
    {
        var intent = await _db.QrPaymentIntents
            .AsNoTracking()
            .Include(i => i.PaymentRecord)
            .Where(i => i.BookingId == booking.Id
                && (i.Status == QrPaymentIntentStatus.Pending
                    || i.Status == QrPaymentIntentStatus.Processing))
            .OrderByDescending(i => i.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (intent is null && booking.Status == BookingStatus.Confirmed)
        {
            intent = await _db.QrPaymentIntents
                .AsNoTracking()
                .Include(i => i.PaymentRecord)
                .Where(i => i.BookingId == booking.Id && i.Status == QrPaymentIntentStatus.Paid)
                .OrderByDescending(i => i.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        // Resume after a failed/expired checkout still needs the deposit amount —
        // fall back to the latest intent of any status.
        if (intent is null)
        {
            intent = await _db.QrPaymentIntents
                .AsNoTracking()
                .Include(i => i.PaymentRecord)
                .Where(i => i.BookingId == booking.Id)
                .OrderByDescending(i => i.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (intent is null)
        {
            return null;
        }

        var postedPaid = await PostedPaidAsync(booking.Id, cancellationToken);
        return Map(intent, booking, intent.PaymentRecord?.ReceiptNumber,
            BalanceDue(booking, postedPaid));
    }

    public async Task<QrPaymentIntentDto> CancelGuestAsync(
        int bookingId, int intentId, string payToken, CancellationToken cancellationToken = default)
    {
        var intent = await _db.QrPaymentIntents
            .Include(i => i.Booking)
            .Include(i => i.PaymentRecord)
            .FirstOrDefaultAsync(i => i.Id == intentId && i.BookingId == bookingId, cancellationToken);
        EnsureGuestToken(intent?.Booking, payToken);

        await CancelIntentAsync(intent!, cancellationToken);

        var postedPaid = await PostedPaidAsync(bookingId, cancellationToken);
        return Map(intent!, intent!.Booking, intent.PaymentRecord?.ReceiptNumber,
            BalanceDue(intent.Booking, postedPaid));
    }

    public async Task ExpireStaleIntentsAsync(int bookingId, CancellationToken cancellationToken = default)
    {
        var open = await _db.QrPaymentIntents
            .Include(i => i.Booking)
            .Where(i => i.BookingId == bookingId && i.Status == QrPaymentIntentStatus.Pending)
            .ToListAsync(cancellationToken);
        foreach (var intent in open)
        {
            await CancelIntentAsync(intent, cancellationToken);
        }
    }

    public async Task<bool> HandleInvoiceWebhookAsync(
        string? callbackToken, JsonDocument body, CancellationToken cancellationToken = default)
    {
        if (!await VerifyCallbackTokenAsync(callbackToken, cancellationToken))
        {
            return false;
        }

        _telemetry.RecordWebhook();

        var root = body.RootElement;
        var invoiceId = root.TryGetProperty("id", out var iEl) ? iEl.GetString() : null;
        var externalId = root.TryGetProperty("external_id", out var eEl) ? eEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(invoiceId) && string.IsNullOrWhiteSpace(externalId))
        {
            return true;
        }

        var intent = await _db.QrPaymentIntents
            .FirstOrDefaultAsync(i =>
                (invoiceId != null && i.XenditInvoiceId == invoiceId)
                || (externalId != null && i.ReferenceId == externalId),
                cancellationToken);
        if (intent is null)
        {
            // Unknown invoice — still 200 so Xendit stops retrying.
            return true;
        }

        var status = root.TryGetProperty("status", out var sEl) ? sEl.GetString() : null;
        var paymentId = root.TryGetProperty("payment_id", out var pEl)
            && pEl.ValueKind == JsonValueKind.String
            ? pEl.GetString()
            : invoiceId;
        var currency = root.TryGetProperty("currency", out var cEl) ? cEl.GetString() : null;
        var paidAmount = root.TryGetProperty("paid_amount", out var aEl)
            && aEl.ValueKind == JsonValueKind.Number
            && aEl.TryGetDecimal(out var an)
            ? an
            : (decimal?)null;
        await ApplyInvoiceStatusAsync(intent, status, paymentId, currency, paidAmount, cancellationToken);
        return true;
    }

    private async Task ApplyInvoiceStatusAsync(
        QrPaymentIntent intent,
        string? status,
        string? paymentId,
        string? currency,
        decimal? paidAmount,
        CancellationToken cancellationToken)
    {
        switch ((status ?? string.Empty).ToUpperInvariant())
        {
            case "PAID":
            case "SETTLED":
                if (!string.Equals(currency, "PHP", StringComparison.OrdinalIgnoreCase)
                    || (paidAmount.HasValue && paidAmount.Value != intent.Amount))
                {
                    _logger.LogWarning(
                        "Xendit invoice amount/currency mismatch for intent {IntentId}: expected {Expected} PHP, got {Amount} {Currency}.",
                        intent.Id, intent.Amount, paidAmount, currency);
                    await MarkFailedAsync(intent.Id, "AMOUNT_MISMATCH", cancellationToken);
                    return;
                }

                await PostLedgerAsync(intent, paymentId, cancellationToken);
                return;

            case "EXPIRED":
                await SetStatusAsync(intent.Id, QrPaymentIntentStatus.Expired, cancellationToken);
                return;

            default:
                return; // PENDING / unknown — still waiting on the guest.
        }
    }

    /// <summary>
    /// Wrong token and missing booking are deliberately indistinguishable (404).
    /// </summary>
    private static void EnsureGuestToken(Booking? booking, string? payToken)
    {
        if (booking is null
            || string.IsNullOrEmpty(booking.GuestPayToken)
            || string.IsNullOrEmpty(payToken))
        {
            throw new KeyNotFoundException("Booking was not found.");
        }

        var expected = Encoding.UTF8.GetBytes(booking.GuestPayToken);
        var provided = Encoding.UTF8.GetBytes(payToken);
        if (expected.Length != provided.Length
            || !CryptographicOperations.FixedTimeEquals(expected, provided))
        {
            throw new KeyNotFoundException("Booking was not found.");
        }
    }

    private async Task<decimal> PostedPaidAsync(int bookingId, CancellationToken cancellationToken)
    {
        return await _db.PaymentRecords
            .Where(p => p.BookingId == bookingId && p.Status == PaymentRecordStatus.Posted)
            .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;
    }

    private static decimal BalanceDue(Booking booking, decimal postedPaid)
    {
        return decimal.Round(booking.TotalAmount - postedPaid, 2, MidpointRounding.AwayFromZero);
    }

    public async Task<QrPaymentIntentDto> SimulateAsync(
        int intentId, CancellationToken cancellationToken = default)
    {
        var intent = await _db.QrPaymentIntents
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == intentId, cancellationToken)
            ?? throw new KeyNotFoundException("QR payment was not found.");

        if (!intent.IsTestMode)
        {
            throw new UnauthorizedAccessException("Simulate is only available in test mode.");
        }

        if (intent.Status == QrPaymentIntentStatus.Pending)
        {
            var secretKey = await _vault.GetAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
            if (!string.IsNullOrWhiteSpace(secretKey))
            {
                try
                {
                    await SendAsync(
                        HttpMethod.Post,
                        $"v3/payment_requests/{intent.XenditPaymentRequestId}/simulate",
                        new { amount = intent.Amount },
                        secretKey,
                        cancellationToken);
                    _telemetry.RecordOk();
                }
                catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
                {
                    _telemetry.RecordError(ex.GetType().Name);
                    throw;
                }
            }
        }

        var refreshed = await GetAsync(intentId, reconcile: true, cancellationToken);
        return refreshed!;
    }

    private async Task<bool> VerifyCallbackTokenAsync(
        string? callbackToken, CancellationToken cancellationToken)
    {
        var vaultToken = await _vault.GetAsync(SecureSettingKeys.XenditWebhookToken, cancellationToken);
        if (string.IsNullOrWhiteSpace(vaultToken) || string.IsNullOrWhiteSpace(callbackToken))
        {
            return false;
        }

        var expected = Encoding.UTF8.GetBytes(vaultToken);
        var provided = Encoding.UTF8.GetBytes(callbackToken);
        return expected.Length == provided.Length
            && CryptographicOperations.FixedTimeEquals(expected, provided);
    }

    public async Task<bool> HandleWebhookAsync(
        string? callbackToken, JsonDocument body, CancellationToken cancellationToken = default)
    {
        if (!await VerifyCallbackTokenAsync(callbackToken, cancellationToken))
        {
            return false;
        }

        _telemetry.RecordWebhook();

        var root = body.RootElement;
        var eventName = root.TryGetProperty("event", out var ev) ? ev.GetString() : null;
        if (eventName is not ("payment.capture" or "payment.authorization" or "payment.failure"
                              or "payment_request.expiry" or "payment_request.canceled"
                              or "payment_request.cancelled"))
        {
            return true;
        }

        if (!root.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
        {
            return true;
        }

        var paymentRequestId = data.TryGetProperty("payment_request_id", out var prId)
            ? prId.GetString()
            : null;
        if (string.IsNullOrWhiteSpace(paymentRequestId))
        {
            return true;
        }

        var intent = await _db.QrPaymentIntents
            .FirstOrDefaultAsync(i => i.XenditPaymentRequestId == paymentRequestId, cancellationToken);
        if (intent is null)
        {
            // Unknown request id — still 200 so Xendit stops retrying.
            return true;
        }

        var status = data.TryGetProperty("status", out var s) ? s.GetString() : null;
        var paymentId = ExtractPaymentId(data);
        var failureCode = data.TryGetProperty("failure_code", out var fc) ? fc.GetString() : null;
        var currency = data.TryGetProperty("currency", out var cur) ? cur.GetString() : null;
        var requestAmount = ExtractAmount(data);
        await ApplyXenditStatusAsync(
            intent, status, paymentId, failureCode, currency, requestAmount, cancellationToken);
        return true;
    }

    private async Task ReconcileAsync(QrPaymentIntent intent, CancellationToken cancellationToken)
    {
        var secretKey = await _vault.GetAsync(SecureSettingKeys.XenditSecretKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(secretKey))
        {
            return;
        }

        try
        {
            if (intent.Channel == XenditChannel.Card)
            {
                if (string.IsNullOrWhiteSpace(intent.XenditInvoiceId))
                {
                    return;
                }

                var invoice = await SendAsync(
                    HttpMethod.Get,
                    $"v2/invoices/{intent.XenditInvoiceId}",
                    null,
                    secretKey,
                    cancellationToken);
                _telemetry.RecordOk();
                var invoiceStatus = invoice.TryGetProperty("status", out var ist) ? ist.GetString() : null;
                var invoicePaymentId = invoice.TryGetProperty("payment_id", out var ipid) && ipid.ValueKind == JsonValueKind.String
                    ? ipid.GetString()
                    : invoice.TryGetProperty("id", out var iid) ? iid.GetString() : null;
                var invoiceCurrency = invoice.TryGetProperty("currency", out var icur) ? icur.GetString() : null;
                var paidAmount = invoice.TryGetProperty("paid_amount", out var pamt)
                    && pamt.ValueKind == JsonValueKind.Number
                    && pamt.TryGetDecimal(out var pn)
                    ? pn
                    : (decimal?)null;
                await ApplyInvoiceStatusAsync(
                    intent, invoiceStatus, invoicePaymentId, invoiceCurrency, paidAmount, cancellationToken);
                return;
            }

            var root = await SendAsync(
                HttpMethod.Get,
                $"v3/payment_requests/{intent.XenditPaymentRequestId}",
                null,
                secretKey,
                cancellationToken);
            _telemetry.RecordOk();
            var status = root.TryGetProperty("status", out var s) ? s.GetString() : null;
            var paymentId = ExtractPaymentId(root);
            var failureCode = root.TryGetProperty("failure_code", out var fc) ? fc.GetString() : null;
            var currency = root.TryGetProperty("currency", out var cur) ? cur.GetString() : null;
            var requestAmount = ExtractAmount(root);
            await ApplyXenditStatusAsync(
                intent, status, paymentId, failureCode, currency, requestAmount, cancellationToken);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            _telemetry.RecordError(ex.GetType().Name);
            _logger.LogWarning(ex, "Xendit reconcile failed for intent {IntentId}.", intent.Id);
        }
    }

    private async Task ApplyXenditStatusAsync(
        QrPaymentIntent intent,
        string? status,
        string? paymentId,
        string? failureCode,
        string? currency,
        decimal? requestAmount,
        CancellationToken cancellationToken)
    {
        switch ((status ?? string.Empty).ToUpperInvariant())
        {
            case "SUCCEEDED":
                if (!string.Equals(currency, "PHP", StringComparison.OrdinalIgnoreCase)
                    || (requestAmount.HasValue && requestAmount.Value != intent.Amount))
                {
                    _logger.LogWarning(
                        "Xendit amount/currency mismatch for intent {IntentId}: expected {Expected} PHP, got {Amount} {Currency}.",
                        intent.Id, intent.Amount, requestAmount, currency);
                    await MarkFailedAsync(intent.Id, "AMOUNT_MISMATCH", cancellationToken);
                    return;
                }

                await PostLedgerAsync(intent, paymentId, cancellationToken);
                return;

            case "FAILED":
                await MarkFailedAsync(intent.Id, failureCode ?? "FAILED", cancellationToken);
                return;

            case "EXPIRED":
            case "CANCELED":
            case "CANCELLED":
                await SetStatusAsync(
                    intent.Id,
                    status!.Equals("EXPIRED", StringComparison.OrdinalIgnoreCase)
                        ? QrPaymentIntentStatus.Expired
                        : QrPaymentIntentStatus.Cancelled,
                    cancellationToken);
                return;

            default:
                return; // REQUIRES_ACTION / PENDING — still waiting on the guest.
        }
    }

    /// <summary>
    /// Post the payment to the ledger exactly once. Claims the intent atomically
    /// (Pending → Processing + XenditPaymentId) before calling PaymentService, which
    /// runs its own serializable transaction — no nested transactions.
    /// </summary>
    private async Task PostLedgerAsync(
        QrPaymentIntent intent, string? paymentId, CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var claimed = await _db.QrPaymentIntents
            .Where(i => i.Id == intent.Id
                && i.Status == QrPaymentIntentStatus.Pending
                && i.XenditPaymentId == null)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(i => i.Status, QrPaymentIntentStatus.Processing)
                .SetProperty(i => i.XenditPaymentId, paymentId)
                .SetProperty(i => i.UpdatedAtUtc, now),
                cancellationToken);
        if (claimed == 0)
        {
            return; // Already posted (or being posted) — idempotent.
        }

        try
        {
            var isCard = intent.Channel == XenditChannel.Card;
            var record = await _paymentService.RecordAsync(new RecordPaymentRequest
            {
                BookingId = intent.BookingId,
                EventType = intent.EventType,
                Method = isCard ? PaymentMethod.Card : PaymentMethod.EWallet,
                Amount = intent.Amount,
                ReceivedBy = intent.CreatedBy,
                ExternalReference = paymentId,
                Notes = isCard
                    ? $"Xendit Card · {intent.ReferenceId}"
                    : $"Xendit QRPh · {intent.ReferenceId}"
            }, cancellationToken);
            var posted = await _paymentService.VerifyAsync(record.Id, cancellationToken);

            await _db.QrPaymentIntents
                .Where(i => i.Id == intent.Id)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(i => i.Status, QrPaymentIntentStatus.Paid)
                    .SetProperty(i => i.PaidAtUtc, DateTime.UtcNow)
                    .SetProperty(i => i.PaymentRecordId, posted.Id)
                    .SetProperty(i => i.UpdatedAtUtc, DateTime.UtcNow),
                    cancellationToken);
            _audit.Record(
                SystemAuditIntent.AdministrativeAction,
                SystemAuditDomain.Payment,
                "Payment.QrPaid",
                "QrPaymentIntent",
                intent.Id.ToString(),
                intent.ReferenceId,
                summary: $"QRPh intent {intent.ReferenceId} paid · {posted.ReceiptNumber} · ₱{intent.Amount:N2}.");
            await _db.SaveChangesAsync(cancellationToken);
            await _hub.Clients.All.PaymentChanged(intent.BookingId);

            if (record.BookingConfirmed)
            {
                var confirmed = await _db.Bookings
                    .AsNoTracking()
                    .FirstOrDefaultAsync(b => b.Id == intent.BookingId, cancellationToken);
                if (confirmed is not null)
                {
                    await _hub.Clients.All.BookingUpdated(new BookingNotificationDto(
                        confirmed.Id,
                        confirmed.Reference,
                        confirmed.GuestName,
                        confirmed.Kind,
                        confirmed.Status,
                        confirmed.CheckInAtUtc,
                        confirmed.CreatedAtUtc,
                        false,
                        "Deposit received — booking confirmed"));
                }

                await _guestCatalog.NotifyChangedAsync("availability", cancellationToken);
            }
        }
        catch (ArgumentException ex)
        {
            // Ledger refused the post (e.g. booking already settled in cash meanwhile).
            // Money was received by Xendit — surface it instead of retrying forever.
            _logger.LogError(ex, "Xendit QRPh {Reference} paid but ledger rejected the post.", intent.ReferenceId);
            await _db.QrPaymentIntents
                .Where(i => i.Id == intent.Id && i.Status == QrPaymentIntentStatus.Processing)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(i => i.Status, QrPaymentIntentStatus.Failed)
                    .SetProperty(i => i.FailureCode, "LEDGER_REJECTED")
                    .SetProperty(i => i.UpdatedAtUtc, DateTime.UtcNow),
                    cancellationToken);
        }
        catch
        {
            await _db.QrPaymentIntents
                .Where(i => i.Id == intent.Id && i.Status == QrPaymentIntentStatus.Processing)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(i => i.Status, QrPaymentIntentStatus.Pending)
                    .SetProperty(i => i.XenditPaymentId, (string?)null)
                    .SetProperty(i => i.UpdatedAtUtc, DateTime.UtcNow),
                    cancellationToken);
            throw;
        }
    }

    private async Task MarkFailedAsync(int intentId, string failureCode, CancellationToken cancellationToken)
    {
        var code = failureCode.Length > 80 ? failureCode[..80] : failureCode;
        await _db.QrPaymentIntents
            .Where(i => i.Id == intentId && i.Status == QrPaymentIntentStatus.Pending)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(i => i.Status, QrPaymentIntentStatus.Failed)
                .SetProperty(i => i.FailureCode, code)
                .SetProperty(i => i.UpdatedAtUtc, DateTime.UtcNow),
                cancellationToken);
    }

    private async Task SetStatusAsync(int intentId, QrPaymentIntentStatus status, CancellationToken cancellationToken)
    {
        await _db.QrPaymentIntents
            .Where(i => i.Id == intentId && i.Status == QrPaymentIntentStatus.Pending)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(i => i.Status, status)
                .SetProperty(i => i.UpdatedAtUtc, DateTime.UtcNow),
                cancellationToken);
    }

    private async Task<JsonElement> SendAsync(
        HttpMethod method,
        string path,
        object? payload,
        string secretKey,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("xendit");
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Basic",
            Convert.ToBase64String(Encoding.UTF8.GetBytes(secretKey + ":")));
        request.Headers.TryAddWithoutValidation("api-version", "2024-11-11");
        if (payload is not null)
        {
            request.Content = new StringContent(
                JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        }

        using var response = await client.SendAsync(request, cancellationToken);
        var bodyText = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorCode = $"HTTP_{(int)response.StatusCode}";
            var errorMessage = "Xendit rejected the request.";
            try
            {
                var err = JsonSerializer.Deserialize<JsonElement>(bodyText);
                if (err.ValueKind == JsonValueKind.Object)
                {
                    if (err.TryGetProperty("error_code", out var ec) && ec.ValueKind == JsonValueKind.String)
                        errorCode = ec.GetString() ?? errorCode;
                    if (err.TryGetProperty("message", out var em) && em.ValueKind == JsonValueKind.String)
                        errorMessage = em.GetString() ?? errorMessage;
                }
            }
            catch (JsonException)
            {
                // Non-JSON error body — keep the HTTP status as the code.
            }

            _telemetry.RecordError($"{errorCode}: {errorMessage}");
            _logger.LogWarning(
                "Xendit {Method} {Path} returned {Status} {ErrorCode}: {ErrorMessage}",
                method, path, (int)response.StatusCode, errorCode, errorMessage);
            throw new XenditApiException(
                (int)response.StatusCode, errorCode, $"Xendit {errorCode}: {errorMessage}");
        }

        return JsonSerializer.Deserialize<JsonElement>(bodyText);
    }

    private static string? ExtractPaymentId(JsonElement data)
    {
        if (data.TryGetProperty("payment_id", out var pid) && pid.ValueKind == JsonValueKind.String)
        {
            return pid.GetString();
        }

        if (data.TryGetProperty("payments", out var payments) && payments.ValueKind == JsonValueKind.Array)
        {
            foreach (var payment in payments.EnumerateArray())
            {
                if (payment.TryGetProperty("payment_id", out var p1) && p1.ValueKind == JsonValueKind.String)
                {
                    return p1.GetString();
                }

                if (payment.TryGetProperty("id", out var p2) && p2.ValueKind == JsonValueKind.String)
                {
                    return p2.GetString();
                }
            }
        }

        return null;
    }

    private static decimal? ExtractAmount(JsonElement data)
    {
        if (!data.TryGetProperty("request_amount", out var raw))
        {
            return null;
        }

        if (raw.ValueKind == JsonValueKind.Number && raw.TryGetDecimal(out var n))
        {
            return n;
        }

        if (raw.ValueKind == JsonValueKind.String
            && decimal.TryParse(raw.GetString(), out var parsed))
        {
            return parsed;
        }

        return null;
    }

    private static QrPaymentIntentDto Map(
        QrPaymentIntent intent, Booking booking, string? receiptNumber, decimal? balanceDue = null)
    {
        var qrImage = intent.Status == QrPaymentIntentStatus.Pending
            && !string.IsNullOrEmpty(intent.QrString)
            ? RenderQrDataUrl(intent.QrString)
            : string.Empty;
        return new QrPaymentIntentDto(
            intent.Id,
            intent.BookingId,
            booking.Reference,
            intent.ReferenceId,
            intent.Amount,
            intent.Status.ToString(),
            qrImage,
            intent.CreatedAtUtc,
            intent.ExpiresAtUtc,
            intent.PaidAtUtc,
            receiptNumber,
            intent.FailureCode,
            intent.IsTestMode,
            intent.Channel.ToString(),
            intent.CheckoutUrl,
            booking.Status.ToString(),
            balanceDue);
    }

    private static readonly byte[] QrDark = { 0x0b, 0x1f, 0x3a };
    private static readonly byte[] QrLight = { 0xff, 0xff, 0xff };

    private static string RenderQrDataUrl(string qrString)
    {
        var data = QRCodeGenerator.GenerateQrCode(qrString, QRCodeGenerator.ECCLevel.M);
        using var png = new PngByteQRCode(data);
        return "data:image/png;base64," + Convert.ToBase64String(
            png.GetGraphic(8, QrDark, QrLight));
    }

    private static string money(decimal value) => $"₱{value:N2}";
}
