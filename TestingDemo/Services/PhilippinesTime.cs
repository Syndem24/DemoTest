using System.Globalization;

namespace TestingDemo.Services;

/// <summary>
/// Hotel local time is Asia/Manila (UTC+8, no DST).
/// </summary>
public static class PhilippinesTime
{
    private static readonly CultureInfo DisplayCulture = CultureInfo.GetCultureInfo("en-PH");

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
    /// User-entered wall times: Unspecified is Manila local. UTC and Local pass through system rules.
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

    /// <summary>
    /// Display/convert stored UTC. EF Core loads datetime2 as Unspecified — treat that as UTC,
    /// not Manila, or 3:00 PM PH is shown as 7:00 AM.
    /// </summary>
    public static DateTime ToManila(DateTime utcOrAny)
    {
        var utc = utcOrAny.Kind == DateTimeKind.Local
            ? utcOrAny.ToUniversalTime()
            : DateTime.SpecifyKind(utcOrAny, DateTimeKind.Utc);
        return TimeZoneInfo.ConvertTimeFromUtc(utc, Zone);
    }

    public static string FormatStamp(DateTime utcOrAny) =>
        ToManila(utcOrAny).ToString("dd MMM yyyy · h:mm tt", DisplayCulture);

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
