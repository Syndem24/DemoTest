namespace TestingDemo.Models;

/// <summary>
/// Audit trail for hard-deleting archived booking history after PDF export.
/// Booking rows themselves are removed; only these flush logs remain.
/// </summary>
public class BookingHistoryFlushLog
{
    public int Id { get; set; }
    public DateTime FlushedAtUtc { get; set; } = DateTime.UtcNow;
    public string PerformedBy { get; set; } = string.Empty;
    public int RecordCount { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
}
