namespace TestingDemo.Models;

public class RoomType
{
    public int RoomTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Multi-value inclusions shared by all rooms of this type (JSON in the database).
    /// </summary>
    public List<string> Inclusions { get; set; } = new();

    /// <summary>
    /// Multi-value room-type images stored as JSON.
    /// </summary>
    public List<string> Images { get; set; } = new();

    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }

    public ICollection<Room> Rooms { get; set; } = new List<Room>();
}
