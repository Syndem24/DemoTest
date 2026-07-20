namespace TestingDemo.Models;

public class UpdateRoomTypeDto
{
    public int RoomTypeId { get; set; }
    public string TypeName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public double? SizeSqm { get; set; }
    public bool IsAvailable { get; set; }
    public List<string> Inclusions { get; set; } = new();
    public List<string> Images { get; set; } = new();
    public List<RoomNumberUpdateItem> RoomNumbers { get; set; } = new();
}
