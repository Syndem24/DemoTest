namespace TestingDemo.Models;

/// <summary>
/// Table <c>StaffAccountAudit</c> — who created/edited/disabled a staff Identity user.
/// </summary>
public class StaffAccountAudit
{
    public int Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string TargetUserId { get; set; } = string.Empty;
    public string PerformedByUserId { get; set; } = string.Empty;
    public string RoleAssigned { get; set; } = string.Empty;
    public DateTime AtUtc { get; set; } = DateTime.UtcNow;
}
