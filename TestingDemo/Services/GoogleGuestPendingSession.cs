namespace TestingDemo.Services;

/// <summary>
/// Holds Google OAuth pending state until the guest accepts privacy/integrity terms.
/// External cookie should still be present; this is a backup + UX grant window.
/// </summary>
public static class GoogleGuestPendingSession
{
    public const string EmailKey = "GoogleGuestPending.Email";
    public const string ProviderKey = "GoogleGuestPending.Provider";
    public const string SubjectKey = "GoogleGuestPending.Subject";
    public const string DisplayNameKey = "GoogleGuestPending.DisplayName";
    public const string ReturnUrlKey = "GoogleGuestPending.ReturnUrl";
    public const string RememberMeKey = "GoogleGuestPending.RememberMe";
    public const string CreatedAtKey = "GoogleGuestPending.CreatedAt";

    public static int GrantMinutes { get; } = 15;

    public static void Set(
        ISession session,
        string email,
        string loginProvider,
        string providerKey,
        string? displayName,
        string? returnUrl,
        bool rememberMe)
    {
        session.SetString(EmailKey, email.Trim());
        session.SetString(ProviderKey, loginProvider);
        session.SetString(SubjectKey, providerKey);
        session.SetString(DisplayNameKey, displayName?.Trim() ?? string.Empty);
        session.SetString(RememberMeKey, rememberMe ? "1" : "0");
        session.SetString(CreatedAtKey, DateTime.UtcNow.ToString("O"));
        if (string.IsNullOrWhiteSpace(returnUrl))
            session.Remove(ReturnUrlKey);
        else
            session.SetString(ReturnUrlKey, returnUrl);
    }

    public static bool TryGet(
        ISession session,
        out string email,
        out string loginProvider,
        out string providerKey,
        out string? displayName,
        out string? returnUrl,
        out bool rememberMe)
    {
        email = session.GetString(EmailKey) ?? string.Empty;
        loginProvider = session.GetString(ProviderKey) ?? string.Empty;
        providerKey = session.GetString(SubjectKey) ?? string.Empty;
        displayName = session.GetString(DisplayNameKey);
        returnUrl = session.GetString(ReturnUrlKey);
        rememberMe = session.GetString(RememberMeKey) == "1";
        var createdRaw = session.GetString(CreatedAtKey);

        if (string.IsNullOrWhiteSpace(email)
            || string.IsNullOrWhiteSpace(loginProvider)
            || string.IsNullOrWhiteSpace(providerKey))
            return false;

        if (!DateTime.TryParse(createdRaw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var createdAt))
            return false;

        if (createdAt.AddMinutes(GrantMinutes) < DateTime.UtcNow)
            return false;

        if (string.IsNullOrWhiteSpace(displayName))
            displayName = null;

        return true;
    }

    public static void Clear(ISession session)
    {
        session.Remove(EmailKey);
        session.Remove(ProviderKey);
        session.Remove(SubjectKey);
        session.Remove(DisplayNameKey);
        session.Remove(ReturnUrlKey);
        session.Remove(RememberMeKey);
        session.Remove(CreatedAtKey);
    }
}
