using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class FlushSystemLogsRequest
{
    public string PerformedBy { get; set; } = string.Empty;
    public List<SystemFlushKind> Kinds { get; set; } = new();
}

public sealed record SystemFlushLogDto(
    int Id,
    SystemFlushKind Kind,
    string KindLabel,
    DateTime FlushedAtUtc,
    DateTime ExpiresAtUtc,
    string PerformedBy,
    int RecordCount,
    string FileName,
    string Summary);

public sealed record SystemFlushPendingCountsDto(
    int BookingHistory,
    int Payments,
    int StaffAudit);

public sealed record FlushSystemLogsResult(
    IReadOnlyList<(byte[] Bytes, string FileName)> Files,
    IReadOnlyList<SystemFlushLogDto> Logs,
    IReadOnlyList<string> Skipped);
