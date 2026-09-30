using TestingDemo.Models;

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
    bool IsTestMode,
    string Channel = "QrPh",
    string? CheckoutUrl = null,
    string? BookingStatus = null,
    decimal? BalanceDue = null);

public sealed class CreateQrPaymentRequest
{
    public int BookingId { get; set; }
    public decimal Amount { get; set; }
}

public sealed record PaymentBrandDto(string Key, string Label, string File, string Channel);

public sealed record GuestDepositMethodsDto(
    bool QrPhEnabled,
    bool CardEnabled,
    IReadOnlyList<PaymentBrandDto> QrPhBrands,
    IReadOnlyList<PaymentBrandDto> CardBrands);

public sealed class GuestDepositIntentRequest
{
    public string PayToken { get; set; } = string.Empty;
    public XenditChannel Channel { get; set; } = XenditChannel.QrPh;
}

public sealed class GuestDepositTokenRequest
{
    public string PayToken { get; set; } = string.Empty;
}
