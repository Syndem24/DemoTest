using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IGoogleVerificationTokenService
{
    string CreateToken(string userId);
    bool TryValidate(string token, out string userId);
}

public sealed class GoogleVerificationTokenService : IGoogleVerificationTokenService
{
    private const string Purpose = "GoogleAccountVerification";
    private static readonly TimeSpan Lifetime = TimeSpan.FromDays(3);

    private readonly IDataProtector _protector;

    public GoogleVerificationTokenService(IDataProtectionProvider dataProtection)
    {
        _protector = dataProtection.CreateProtector(Purpose);
    }

    public string CreateToken(string userId)
    {
        var payload = $"{userId}|{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";
        return _protector.Protect(payload);
    }

    public bool TryValidate(string token, out string userId)
    {
        userId = string.Empty;
        if (string.IsNullOrWhiteSpace(token))
            return false;

        try
        {
            var payload = _protector.Unprotect(token);
            var parts = payload.Split('|', 2);
            if (parts.Length != 2)
                return false;

            if (!long.TryParse(parts[1], out var issuedUnix))
                return false;

            var issued = DateTimeOffset.FromUnixTimeSeconds(issuedUnix);
            if (DateTimeOffset.UtcNow - issued > Lifetime)
                return false;

            userId = parts[0];
            return !string.IsNullOrWhiteSpace(userId);
        }
        catch
        {
            return false;
        }
    }
}

public interface IStaffOnboardingEmailSender
{
    Task SendOnboardingAsync(ApplicationUser user, string temporaryPassword, string googleVerifyUrl, CancellationToken cancellationToken = default);
}

/// <summary>
/// Logs onboarding material (dev-friendly). Replace with real SMTP later.
/// </summary>
public sealed class LoggingStaffOnboardingEmailSender : IStaffOnboardingEmailSender
{
    private readonly ILogger<LoggingStaffOnboardingEmailSender> _logger;

    public LoggingStaffOnboardingEmailSender(ILogger<LoggingStaffOnboardingEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendOnboardingAsync(
        ApplicationUser user,
        string temporaryPassword,
        string googleVerifyUrl,
        CancellationToken cancellationToken = default)
    {
        _logger.LogWarning(
            "Staff onboarding for {UserName} ({Email}). Temporary password was set by admin (value not logged). GoogleVerifyUrl={Url}",
            user.UserName,
            user.Email,
            googleVerifyUrl);
        Console.WriteLine();
        Console.WriteLine("======== STAFF ONBOARDING (dev email) ========");
        Console.WriteLine($"User: {user.UserName} / {user.Email}");
        Console.WriteLine("Temporary password: set by admin (not printed). User must change it on first login.");
        Console.WriteLine($"Google verify: {googleVerifyUrl}");
        Console.WriteLine("==============================================");
        Console.WriteLine();
        return Task.CompletedTask;
    }
}

public static class GoogleAuthGuards
{
    public static bool IsEligibleForGoogleAuthOrRecovery(ApplicationUser user) =>
        ApplicationUser.CanUseGoogleForAuthOrRecovery(user);
}
