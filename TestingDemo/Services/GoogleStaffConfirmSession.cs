namespace TestingDemo.Services;

/// <summary>
/// Session grant after Google OAuth matches a staff recovery email — before staff cookie is issued.
/// </summary>
public static class GoogleStaffConfirmSession
{
    public const string UserIdKey = "GoogleStaffConfirm.UserId";
    public const string SubjectKey = "GoogleStaffConfirm.Subject";
    public const string EmailKey = "GoogleStaffConfirm.Email";
    public const string ReturnUrlKey = "GoogleStaffConfirm.ReturnUrl";
    public const string CreatedAtKey = "GoogleStaffConfirm.CreatedAt";

    public static int GrantMinutes { get; } = 10;

    public static void Set(
        ISession session,
        string userId,
        string googleSubject,
        string googleEmail,
        string? returnUrl)
    {
        session.SetString(UserIdKey, userId);
        session.SetString(SubjectKey, googleSubject);
        session.SetString(EmailKey, googleEmail.Trim());
        session.SetString(CreatedAtKey, DateTime.UtcNow.ToString("O"));
        if (string.IsNullOrWhiteSpace(returnUrl))
            session.Remove(ReturnUrlKey);
        else
            session.SetString(ReturnUrlKey, returnUrl);
    }

    public static bool TryGet(
        ISession session,
        out string userId,
        out string googleSubject,
        out string googleEmail,
        out string? returnUrl)
    {
        userId = session.GetString(UserIdKey) ?? string.Empty;
        googleSubject = session.GetString(SubjectKey) ?? string.Empty;
        googleEmail = session.GetString(EmailKey) ?? string.Empty;
        returnUrl = session.GetString(ReturnUrlKey);
        var createdRaw = session.GetString(CreatedAtKey);

        if (string.IsNullOrWhiteSpace(userId)
            || string.IsNullOrWhiteSpace(googleSubject)
            || string.IsNullOrWhiteSpace(googleEmail))
            return false;

        if (!DateTime.TryParse(createdRaw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var createdAt))
            return false;

        if (createdAt.AddMinutes(GrantMinutes) < DateTime.UtcNow)
            return false;

        return true;
    }

    public static void Clear(ISession session)
    {
        session.Remove(UserIdKey);
        session.Remove(SubjectKey);
        session.Remove(EmailKey);
        session.Remove(ReturnUrlKey);
        session.Remove(CreatedAtKey);
    }
}
