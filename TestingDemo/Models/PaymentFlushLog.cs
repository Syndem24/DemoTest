namespace TestingDemo.Models;

/// <summary>
/// Audit trail for hard-deleting payment records after PDF export.
/// Payment rows are removed; flush logs are retained for 7 days, then purged.
/// </summary>
public class PaymentFlushLog
{
    public int Id { get; set; }
    public DateTime FlushedAtUtc { get; set; } = DateTime.UtcNow;
    public string PerformedBy { get; set; } = string.Empty;
    public int RecordCount { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
}
