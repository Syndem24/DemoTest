namespace TestingDemo.Models;

/// <summary>One-time 6-digit code for staff password reset (SMTP). Table <c>StaffPasswordResetCode</c>.</summary>
public sealed class StaffPasswordResetCode
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string NormalizedEmail { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public DateTime? ConsumedAtUtc { get; set; }
    public int FailedAttempts { get; set; }
}
