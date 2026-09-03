namespace TestingDemo.Models;

/// <summary>
/// Staff authentication tables — one profile row per login, separate satellite tables for Identity.
/// </summary>
public static class StaffAuthSchema
{
    public const string UserTable = "StaffUser";
    public const string RoleTable = "StaffRole";
    public const string ExternalLoginTable = "StaffExternalLogin";
    public const string AuthTokenTable = "StaffAuthToken";
    public const string PasswordResetCodeTable = "StaffPasswordResetCode";
    public const string AuditTargetType = "StaffUser";
    public const string AccountActionPrefix = "Account.";
}
