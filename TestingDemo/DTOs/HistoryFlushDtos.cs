using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class FlushBookingHistoryRequest
{
    public string PerformedBy { get; set; } = string.Empty;
}

public sealed record BookingHistoryFlushLogDto(
    int Id,
    DateTime FlushedAtUtc,
    string PerformedBy,
    int RecordCount,
    string FileName,
    string Summary);

public sealed record FlushBookingHistoryResult(
    byte[] PdfBytes,
    string FileName,
    BookingHistoryFlushLogDto Log);
