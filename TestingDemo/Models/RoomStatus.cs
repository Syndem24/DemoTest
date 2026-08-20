namespace TestingDemo.Models;

public enum RoomStatus
{
    Available = 0,
    Unavailable = 1,
    Occupied = 2,
    /// <summary>Vacant after checkout; needs housekeeping before it can take guests.</summary>
    Cleaning = 3
}

public static class RoomStatusDisplay
{
    public static string Label(RoomStatus status) => status switch
    {
        RoomStatus.Available => "Available",
        RoomStatus.Unavailable => "Unavailable",
        RoomStatus.Occupied => "Occupied",
        RoomStatus.Cleaning => "Maintaining",
        _ => status.ToString()
    };

    public static string CssClass(RoomStatus status) => status switch
    {
        RoomStatus.Available => "is-available",
        RoomStatus.Occupied => "is-occupied",
        RoomStatus.Cleaning => "is-cleaning",
        _ => "is-unavailable"
    };
}
