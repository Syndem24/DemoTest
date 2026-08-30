namespace TestingDemo.Models;

/// <summary>
/// Table <c>RoomType</c> — sellable category (Queen, Twin, …) with shared rate, occupancy, photos, and inclusions.
/// Individual door numbers live in <see cref="Room"/>.
/// </summary>
public class RoomType
{
    /// <summary>Primary key (column <c>RoomTypeId</c>).</summary>
    public int RoomTypeId { get; set; }
    /// <summary>Unique display name (e.g. Queen Room).</summary>
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>When this room type was created (UTC).</summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Multi-value inclusions shared by all rooms of this type (JSON in the database).
    /// </summary>
    public List<string> Inclusions { get; set; } = new();

    /// <summary>
    /// Multi-value room-type images stored as JSON.
    /// </summary>
    public List<string> Images { get; set; } = new();

    /// <summary>Standard nightly rate before promo.</summary>
    public decimal PricePerNight { get; set; }
    /// <summary>Max guests this type can hold.</summary>
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }

    public ICollection<Room> Rooms { get; set; } = new List<Room>();
    public ICollection<SpecialOffer> SpecialOffers { get; set; } = new List<SpecialOffer>();
}
