namespace TestingDemo.Models;

/// <summary>
/// Table <c>Room</c> — one physical guest room (door number) belonging to a <see cref="RoomType"/>.
/// </summary>
public class Room
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }
    /// <summary>FK to <c>RoomType.RoomTypeId</c>.</summary>
    public int RoomTypeId { get; set; }
    /// <summary>Unique door / inventory number shown to staff (e.g. 101).</summary>
    public string RoomNumber { get; set; } = string.Empty;
    /// <summary>Housekeeping / occupancy state. Occupied is set when a stay is assigned.</summary>
    public RoomStatus Status { get; set; } = RoomStatus.Available;

    public RoomType RoomType { get; set; } = null!;
}
