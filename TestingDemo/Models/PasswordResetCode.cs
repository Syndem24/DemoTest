namespace TestingDemo.Models;

/// <summary>One-time 6-digit code for password reset (SMTP) — staff and guest accounts. Table <c>PasswordResetCode</c>.</summary>
public sealed class PasswordResetCode
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
