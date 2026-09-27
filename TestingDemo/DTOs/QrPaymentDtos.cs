namespace TestingDemo.DTOs;

public sealed record QrPaymentIntentDto(
    int Id,
    int BookingId,
    string BookingReference,
    string ReferenceId,
    decimal Amount,
    string Status,
    string QrImageDataUrl,
    DateTime CreatedAtUtc,
    DateTime? ExpiresAtUtc,
    DateTime? PaidAtUtc,
    string? ReceiptNumber,
    string? FailureCode,
    bool IsTestMode);

public sealed class CreateQrPaymentRequest
{
    public int BookingId { get; set; }
    public decimal Amount { get; set; }
}
