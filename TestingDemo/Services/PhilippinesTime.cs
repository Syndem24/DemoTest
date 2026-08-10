namespace TestingDemo.Services;

/// <summary>
/// Hotel local time is Asia/Manila (UTC+8, no DST).
/// </summary>
public static class PhilippinesTime
{
    public static readonly TimeZoneInfo Zone = ResolveZone();

    private static TimeZoneInfo ResolveZone()
    {
        foreach (var id in new[] { "Asia/Manila", "Singapore Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone(
            "Asia/Manila",
            TimeSpan.FromHours(8),
            "Philippines Standard Time",
            "Philippines Standard Time");
    }

    /// <summary>
    /// Interprets Unspecified as Manila local; passes through UTC; converts Local via system rules.
    /// </summary>
    public static DateTime ToUtc(DateTime value)
    {
        return value.Kind switch
        {
            DateTimeKind.Utc => DateTime.SpecifyKind(value, DateTimeKind.Utc),
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(value, DateTimeKind.Unspecified),
                Zone)
        };
    }

    public static DateTime ToManila(DateTime utcOrAny)
    {
        var utc = utcOrAny.Kind == DateTimeKind.Utc
            ? utcOrAny
            : ToUtc(utcOrAny);
        return TimeZoneInfo.ConvertTimeFromUtc(
            DateTime.SpecifyKind(utc, DateTimeKind.Utc),
            Zone);
    }

    public static DateTime NowManila() => ToManila(DateTime.UtcNow);

    public static DateTime StartOfTodayUtc()
    {
        var todayManila = NowManila().Date;
        return TimeZoneInfo.ConvertTimeToUtc(
            DateTime.SpecifyKind(todayManila, DateTimeKind.Unspecified),
            Zone);
    }

    /// <summary>
    /// True when Manila calendar date is on/after the booking's check-in date
    /// (reception may assign rooms from arrival day onward, not earlier).
    /// </summary>
    public static bool IsOnOrAfterArrivalDate(DateTime checkInAtUtc)
    {
        var arrivalDate = ToManila(checkInAtUtc).Date;
        var today = NowManila().Date;
        return today >= arrivalDate;
    }
}
