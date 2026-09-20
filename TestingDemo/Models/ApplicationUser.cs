using Microsoft.AspNetCore.Identity;

namespace TestingDemo.Models;

/// <summary>
/// Table <c>AccountUser</c> — login profile for staff and Google guests (ASP.NET Identity). Role is stored on <see cref="RoleId"/> (<c>AccountRole</c>).
/// </summary>
public class ApplicationUser : IdentityUser
{
    /// <summary>Employee display name shown in admin staff tooling.</summary>
    public string? FullName { get; set; }

    public DateOnly? BirthDate { get; set; }

    public string? Address { get; set; }

    public bool MustChangePassword { get; set; }

    /// <summary>AccountRole.Id for this account (one role per login).</summary>
    public string? RoleId { get; set; }

    /// <summary>Gmail address intended for future 2FA / password reset.</summary>
    public string? GoogleEmail { get; set; }

    public string? NormalizedGoogleEmail { get; set; }

    public GoogleVerificationStatus GoogleVerificationStatus { get; set; }
        = GoogleVerificationStatus.NotLinked;

    /// <summary>Serialized GridStack widget layout for <c>/Dashboard</c>.</summary>
    public string? DashboardLayoutJson { get; set; }

    public static bool CanUseGoogleForAuthOrRecovery(ApplicationUser user) =>
        user.GoogleVerificationStatus == GoogleVerificationStatus.GoogleVerified
        && !string.IsNullOrWhiteSpace(user.GoogleEmail);

    /// <summary>Staff recovery Gmail is verified and ready for Google sign-in elevation.</summary>
    public static bool HasVerifiedGoogleRecovery(ApplicationUser user) =>
        CanUseGoogleForAuthOrRecovery(user);
}
