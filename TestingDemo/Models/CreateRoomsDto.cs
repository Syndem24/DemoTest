namespace TestingDemo.Models;

public class CreateRoomsDto
{
    public string TypeName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public List<string> Inclusions { get; set; } = new();
    public List<CustomInclusionCategory> CustomCategories { get; set; } = new();
    public List<string> Images { get; set; } = new();
    public List<string> RoomNumbers { get; set; } = new();
}
