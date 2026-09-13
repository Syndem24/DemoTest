using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public sealed class AdminFlushLogsViewModel
{
    public string PerformedBy { get; set; } = string.Empty;
    public List<SystemFlushKind> Kinds { get; set; } = new();
    public DateOnly? FromDate { get; set; }
    public DateOnly? ToDate { get; set; }
    public SystemFlushKind? FilterKind { get; set; }
    public int HistoryPending { get; set; }
    public int PaymentsPending { get; set; }
    public int StaffAuditPending { get; set; }
    public IReadOnlyList<AdminFlushLogRow> Logs { get; set; } = Array.Empty<AdminFlushLogRow>();
    public string? Error { get; set; }
    public string? Message { get; set; }

    public string? Search { get; set; }
    public SystemAuditDomain? Domain { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 15;
    public int AuditTotal { get; set; }
    public IReadOnlyList<SystemAuditLogDto> AuditRows { get; set; } = Array.Empty<SystemAuditLogDto>();

    public int AuditTotalPages =>
        AuditTotal <= 0 ? 1 : (int)Math.Ceiling(AuditTotal / (double)Math.Max(1, PageSize));
}

public sealed class AdminFlushLogRow
{
    public int Id { get; set; }
    public string KindLabel { get; set; } = string.Empty;
    public DateTime FlushedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public string PerformedBy { get; set; } = string.Empty;
    public int RecordCount { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
}
