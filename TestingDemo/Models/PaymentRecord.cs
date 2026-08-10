namespace TestingDemo.Models;

public enum PaymentMethod
{
    Cash = 0,
    /// <summary>Legacy. Prefer EWallet or BankTransfer for new payments.</summary>
    Card = 1,
    /// <summary>GCash, Maya, PayPal, and other e-wallets (value kept from former GCash).</summary>
    EWallet = 2,
    /// <summary>InstaPay QR / bank transfer to hotel profile.</summary>
    BankTransfer = 3,
    /// <summary>Legacy catch-all.</summary>
    Other = 4,
    /// <summary>Legacy Maya method; treat as EWallet in UI.</summary>
    Maya = 5
}

public enum PaymentEventType
{
    Deposit = 0,
    ArrivalPayment = 1,
    BalanceSettlement = 2,
    Refund = 3,
    Adjustment = 4
}

public enum PaymentRecordStatus
{
    Posted = 0,
    Voided = 1
}

/// <summary>
/// Append-only company payment log for a booking/walk-in stay.
/// </summary>
public class PaymentRecord
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public string ReceiptNumber { get; set; } = string.Empty;
    public PaymentEventType EventType { get; set; }
    public PaymentMethod Method { get; set; }
    public decimal Amount { get; set; }
    public decimal StayTotalAtPosting { get; set; }
    public decimal BalanceAfter { get; set; }
    public DateTime PaidAtUtc { get; set; } = DateTime.UtcNow;
    public string ReceivedBy { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public PaymentRecordStatus Status { get; set; } = PaymentRecordStatus.Posted;

    /// <summary>
    /// E-wallet / InstaPay reference from guest receipt (OCR or manual).
    /// </summary>
    public string? ExternalReference { get; set; }

    /// <summary>
    /// Bank transfer / InstaPay clearing reference when Method is BankTransfer.
    /// </summary>
    public string? BankTransferReference { get; set; }

    /// <summary>
    /// Stored path for uploaded e-wallet / InstaPay receipt image.
    /// </summary>
    public string? ReceiptImagePath { get; set; }

    public DateTime? VoidedAtUtc { get; set; }
    public string? VoidReason { get; set; }
    public string? VoidedBy { get; set; }

    public Booking Booking { get; set; } = null!;
}
