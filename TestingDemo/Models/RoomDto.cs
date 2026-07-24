namespace TestingDemo.Models;

public class RoomDto
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RoomNumber { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public RoomStatus Status { get; set; } = RoomStatus.Available;
    public DateTime CreatedAt { get; set; }
    public List<string> Inclusions { get; set; } = new();
    public List<CustomInclusionCategory> CustomCategories { get; set; } = new();
    public List<string> Images { get; set; } = new();
}
