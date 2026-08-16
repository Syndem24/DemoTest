using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class RecordPaymentRequest
{
    public int BookingId { get; set; }
    public PaymentEventType EventType { get; set; } = PaymentEventType.ArrivalPayment;
    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;
    public decimal Amount { get; set; }
    public string ReceivedBy { get; set; } = string.Empty;
    public string? ExternalReference { get; set; }
    public string? Notes { get; set; }

    /// <summary>Bank transfer / clearing reference when Method is BankTransfer.</summary>
    public string? BankTransferReference { get; set; }

    /// <summary>Relative path to stored e-wallet receipt image under wwwroot.</summary>
    public string? ReceiptImagePath { get; set; }
}

public sealed class VoidPaymentRequest
{
    public string VoidedBy { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

/// <summary>
/// Manual corrections to receipt proof metadata (does not change posted Amount).
/// </summary>
public sealed class UpdatePaymentReceiptDetailsRequest
{
    public string? ExternalReference { get; set; }
    public string? TransferFrom { get; set; }
    public string? TransferTo { get; set; }
    public string? Channel { get; set; }
    public decimal? ReceiptAmount { get; set; }
}

public sealed record PaymentRecordDto(
    int Id,
    int BookingId,
    string BookingReference,
    string GuestName,
    string ReceiptNumber,
    PaymentEventType EventType,
    PaymentMethod Method,
    decimal Amount,
    decimal StayTotalAtPosting,
    decimal BalanceAfter,
    DateTime PaidAtUtc,
    string ReceivedBy,
    string? ExternalReference,
    string? BankTransferReference,
    string? ReceiptImagePath,
    string? Notes,
    PaymentRecordStatus Status,
    DateTime? VoidedAtUtc,
    string? VoidReason,
    string? VoidedBy);

public sealed record BookingPaymentSummaryDto(
    int BookingId,
    string Reference,
    string GuestName,
    decimal StayTotal,
    decimal AmountPaid,
    decimal BalanceDue,
    IReadOnlyList<PaymentRecordDto> Payments);

public sealed record PagedPaymentsDto(
    IReadOnlyList<PaymentRecordDto> Items,
    int Page,
    int PageSize,
    int Total,
    decimal TotalCollected,
    decimal TotalRefunded);
