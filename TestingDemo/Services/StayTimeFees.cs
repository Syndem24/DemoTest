namespace TestingDemo.Services;

/// <summary>
/// Early check-in / late check-out / extra-person fees (aligned with guest + admin UI).
/// Early check-in is only offered at 11:30 AM Manila.
/// </summary>
public static class StayTimeFees
{
    public static readonly TimeSpan EarlyCheckInTime = new(11, 30, 0);
    public static readonly TimeSpan DefaultCheckInTime = new(14, 0, 0);
    public static readonly TimeSpan DefaultCheckOutTime = new(12, 0, 0);

    public const decimal EarlyCheckInFeePerRoom = 500m;
    public const decimal LateCheckoutFeePerRoomPerHour = 100m;
    public const decimal ExtraPersonFeePerNight = 200m;
    public const int MaxLateCheckoutHours = 3;
    public const int MaxExtraPersonsOnSingleRoom = 1;

    public static bool IsEarlyCheckIn(DateTime checkInAtUtc)
    {
        var local = PhilippinesTime.ToManila(checkInAtUtc);
        return local.TimeOfDay == EarlyCheckInTime;
    }

    public static decimal ComputeEarlyCheckInFee(DateTime checkInAtUtc, int roomCount)
    {
        if (roomCount < 1) return 0m;
        return IsEarlyCheckIn(checkInAtUtc)
            ? EarlyCheckInFeePerRoom * roomCount
            : 0m;
    }

    public static int LateCheckoutHours(DateTime checkoutTimeUtc)
    {
        var local = PhilippinesTime.ToManila(checkoutTimeUtc);
        var lateMinutes = (int)(local.TimeOfDay - DefaultCheckOutTime).TotalMinutes;
        if (lateMinutes <= 0) return 0;
        var hours = (int)Math.Round(lateMinutes / 60.0);
        return Math.Clamp(hours, 0, MaxLateCheckoutHours);
    }

    public static decimal ComputeLateCheckoutFee(DateTime checkoutTimeUtc, int roomCount)
    {
        if (roomCount < 1) return 0m;
        return LateCheckoutHours(checkoutTimeUtc) * LateCheckoutFeePerRoomPerHour * roomCount;
    }

    public static decimal ComputeTotal(DateTime checkInAtUtc, DateTime checkoutTimeUtc, int roomCount)
    {
        return ComputeEarlyCheckInFee(checkInAtUtc, roomCount)
            + ComputeLateCheckoutFee(checkoutTimeUtc, roomCount);
    }

    public static bool IsSingleRoomType(int maxOccupancy, string? roomTypeName)
    {
        if (maxOccupancy == 1) return true;
        return !string.IsNullOrWhiteSpace(roomTypeName)
            && roomTypeName.Contains("single", StringComparison.OrdinalIgnoreCase);
    }

    public static DateTime WithManilaTimeOfDay(DateTime utcMoment, TimeSpan timeOfDay)
    {
        var localDate = PhilippinesTime.ToManila(utcMoment).Date;
        var local = DateTime.SpecifyKind(localDate + timeOfDay, DateTimeKind.Unspecified);
        return PhilippinesTime.ToUtc(local);
    }
}
