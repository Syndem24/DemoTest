namespace TestingDemo.Models;

/// <summary>
/// Identity authentication tables — one profile row per login (staff and Google guests),
/// separate satellite tables for Identity.
/// </summary>
public static class AccountAuthSchema
{
    public const string UserTable = "AccountUser";
    public const string RoleTable = "AccountRole";
    public const string ExternalLoginTable = "AccountExternalLogin";
    public const string AuthTokenTable = "AccountAuthToken";
    public const string PasswordResetCodeTable = "PasswordResetCode";
    public const string AuditTargetType = "AccountUser";
    public const string AccountActionPrefix = "Account.";
}
