namespace TestingDemo.Models;

public class RoomType
{
    public int RoomTypeId { get; set; }
    public string TypeName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Multi-value inclusions shared by all rooms of this type (JSON in the database).
    /// </summary>
    public List<string> Inclusions { get; set; } = new();

    /// <summary>
    /// User-defined inclusion categories (JSON), in addition to the built-in catalog.
    /// </summary>
    public List<CustomInclusionCategory> CustomCategories { get; set; } = new();

    /// <summary>
    /// Multi-value room-type images stored as JSON.
    /// </summary>
    public List<string> Images { get; set; } = new();

    public ICollection<Room> Rooms { get; set; } = new List<Room>();
}
