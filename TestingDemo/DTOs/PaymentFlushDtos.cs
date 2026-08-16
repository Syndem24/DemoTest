namespace TestingDemo.DTOs;

public sealed class FlushPaymentsRequest
{
    public string PerformedBy { get; set; } = string.Empty;
}

public sealed record PaymentFlushLogDto(
    int Id,
    DateTime FlushedAtUtc,
    DateTime ExpiresAtUtc,
    string PerformedBy,
    int RecordCount,
    string FileName,
    string Summary);

public sealed record FlushPaymentsResult(
    byte[] PdfBytes,
    string FileName,
    PaymentFlushLogDto Log);
