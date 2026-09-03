namespace TestingDemo.Services;

/// <summary>Session-backed grant after OTP verification (before new password is set).</summary>
public static class PasswordResetSession
{
    public const string EmailKey = "PwdReset.Email";
    public const string CodeKey = "PwdReset.Code";
    public const string VerifiedAtKey = "PwdReset.VerifiedAt";

    public static int GrantMinutes { get; } = 10;

    public static void SetGrant(ISession session, string email, string encodedResetCode)
    {
        session.SetString(EmailKey, email.Trim());
        session.SetString(CodeKey, encodedResetCode);
        session.SetString(VerifiedAtKey, DateTime.UtcNow.ToString("O"));
    }

    public static bool TryGetGrant(ISession session, out string email, out string encodedResetCode)
    {
        email = session.GetString(EmailKey) ?? string.Empty;
        encodedResetCode = session.GetString(CodeKey) ?? string.Empty;
        var verifiedAtRaw = session.GetString(VerifiedAtKey);

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(encodedResetCode))
            return false;

        if (!DateTime.TryParse(verifiedAtRaw, null, System.Globalization.DateTimeStyles.RoundtripKind, out var verifiedAt))
            return false;

        if (verifiedAt.AddMinutes(GrantMinutes) < DateTime.UtcNow)
            return false;

        return true;
    }

    public static void Clear(ISession session)
    {
        session.Remove(EmailKey);
        session.Remove(CodeKey);
        session.Remove(VerifiedAtKey);
    }
}
