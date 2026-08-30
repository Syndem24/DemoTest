namespace TestingDemo.Models;

/// <summary>Which operational dataset a flush exported and deleted.</summary>
public enum SystemFlushKind
{
    BookingHistory = 0,
    Payments = 1,
    StaffAudit = 2
}

/// <summary>
/// Table <c>SystemFlushLog</c> — one audit trail for exporting then hard-deleting
/// booking history, completed-stay payments, or staff account audit rows.
/// </summary>
public class SystemFlushLog
{
    public int Id { get; set; }
    public SystemFlushKind Kind { get; set; }
    public DateTime FlushedAtUtc { get; set; } = DateTime.UtcNow;
    public string PerformedBy { get; set; } = string.Empty;
    public int RecordCount { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
}
