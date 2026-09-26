namespace TestingDemo.Services;

public static class GuestBookingEmailSet
{
    public static HashSet<string> Build(string? email, string? googleEmail)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Add(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            var trimmed = value.Trim();
            if (trimmed.Contains('@', StringComparison.OrdinalIgnoreCase))
                set.Add(trimmed);
        }

        Add(email);
        Add(googleEmail);
        return set;
    }

    public static bool Matches(string? bookingEmail, HashSet<string> emails)
    {
        if (string.IsNullOrWhiteSpace(bookingEmail) || emails.Count == 0) return false;
        return emails.Contains(bookingEmail.Trim());
    }
}
