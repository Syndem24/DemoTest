using TestingDemo.Models;
using TestingDemo.ViewModels;

namespace TestingDemo.Services;

/// <summary>Maps unified <see cref="SystemAuditLog"/> rows to staff account activity UI.</summary>
public static class StaffAccountActivityMapper
{
    public static readonly HashSet<string> ActivityActionKeys = new(StringComparer.Ordinal)
    {
        "Created",
        "Edited",
        "Disabled",
        "Enabled",
        "Deleted",
        "Profile.Update",
        "RecoveryEmail.Update",
        "Password.Update",
        "Password.Reset"
    };

    public static bool IsAccountActivityAction(string action)
    {
        var key = NormalizeActionKey(action);
        return ActivityActionKeys.Contains(key);
    }

    public static string NormalizeActionKey(string action)
    {
        if (string.IsNullOrWhiteSpace(action))
            return string.Empty;

        var trimmed = action.Trim();
        if (trimmed.StartsWith(StaffAuthSchema.AccountActionPrefix, StringComparison.Ordinal))
            return trimmed[StaffAuthSchema.AccountActionPrefix.Length..];

        return trimmed;
    }

    public static string ToAccountAction(string actionKey) =>
        actionKey.StartsWith(StaffAuthSchema.AccountActionPrefix, StringComparison.Ordinal)
            ? actionKey
            : StaffAuthSchema.AccountActionPrefix + actionKey;

    public static AccountActivityItem MapActivity(SystemAuditLog row)
    {
        var actionKey = NormalizeActionKey(row.Action);
        var (title, fallback) = actionKey switch
        {
            "Profile.Update" => ("Profile details updated", "Account details"),
            "RecoveryEmail.Update" => ("Login / recovery email changed", "Email"),
            "Password.Update" => ("Password changed", "Password"),
            "Password.Reset" => ("Password reset from email link", "Password"),
            "Created" => ("Account created", "Staff account"),
            "Edited" => ("Account edited by an administrator", "Account details"),
            "Disabled" => ("Account disabled", "Access"),
            "Enabled" => ("Account enabled", "Access"),
            "Deleted" => ("Account deleted", "Staff account"),
            _ => ("Account updated", "Account")
        };

        var detail = string.IsNullOrWhiteSpace(row.Summary) ? fallback : row.Summary.Trim();
        if (detail.Equals("Unassigned", StringComparison.Ordinal))
            detail = fallback;

        var local = PhilippinesTime.ToManila(row.AtUtc);
        return new AccountActivityItem
        {
            Title = title,
            Detail = detail,
            WhenLocal = local.ToString("dd MMM yyyy, h:mm tt"),
            WhenUtc = DateTime.SpecifyKind(row.AtUtc, DateTimeKind.Utc).ToString("o")
        };
    }
}
