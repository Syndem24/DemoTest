namespace TestingDemo.Models;

public enum QrPaymentIntentStatus
{
    Pending = 0,
    Paid = 1,
    Failed = 2,
    Expired = 3,
    Cancelled = 4,
    /// <summary>Transient: intent claimed while the ledger post runs.</summary>
    Processing = 5
}

/// <summary>
/// Table <c>QrPaymentIntent</c> — a Xendit QRPh payment request for a walk-in/booking balance.
/// </summary>
public class QrPaymentIntent
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;

    /// <summary>Our idempotency reference sent to Xendit ("MORI-{bookingRef}-{8 hex}").</summary>
    public string ReferenceId { get; set; } = string.Empty;

    /// <summary>Xendit payment_request_id.</summary>
    public string XenditPaymentRequestId { get; set; } = string.Empty;

    /// <summary>Xendit payment_id once captured — enforces post-once via unique index.</summary>
    public string? XenditPaymentId { get; set; }

    public decimal Amount { get; set; }
    public string Currency { get; set; } = "PHP";
    public QrPaymentIntentStatus Status { get; set; } = QrPaymentIntentStatus.Pending;
    public string QrString { get; set; } = string.Empty;
    public DateTime? ExpiresAtUtc { get; set; }
    public DateTime? PaidAtUtc { get; set; }
    public int? PaymentRecordId { get; set; }
    public PaymentRecord? PaymentRecord { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public string? FailureCode { get; set; }
    public bool IsTestMode { get; set; }
}
