namespace TestingDemo.Models;

public class CreateRoomDto
{
    public string TypeName { get; set; } = string.Empty;
    public string RoomNumber { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public List<string> Inclusions { get; set; } = new();
}
