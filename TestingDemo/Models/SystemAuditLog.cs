namespace TestingDemo.Models;

/// <summary>Why the event exists — the integrity taxonomy for the audit page.</summary>
public enum SystemAuditIntent
{
    AdministrativeAction = 0,
    ConfigurationChange = 1,
    FileModification = 2
}

/// <summary>Which hotel domain the event belongs to.</summary>
public enum SystemAuditDomain
{
    Payment = 0,
    Account = 1,
    Booking = 2,
    SpecialOffer = 3,
    Configuration = 4,
    File = 5
}

/// <summary>
/// Table <c>SystemAuditLog</c> — append-only integrity trail (who / what / when / target / why).
/// Never flushed or auto-deleted.
/// </summary>
public class SystemAuditLog
{
    public long Id { get; set; }
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
    public SystemAuditIntent Intent { get; set; }
    public SystemAuditDomain Domain { get; set; }
    public string Action { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string ActorDisplayName { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string TargetLabel { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string Summary { get; set; } = string.Empty;
}
