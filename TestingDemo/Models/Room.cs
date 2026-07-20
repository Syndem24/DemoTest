namespace TestingDemo.Models;

public class Room
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }
    public string RoomNumber { get; set; } = string.Empty;
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public double? SizeSqm { get; set; }
    public bool IsAvailable { get; set; } = true;
    public DateTime? UpdatedAt { get; set; }

    public RoomType RoomType { get; set; } = null!;
}
