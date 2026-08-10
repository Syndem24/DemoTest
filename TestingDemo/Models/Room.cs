namespace TestingDemo.Models;

public class Room
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }
    public string RoomNumber { get; set; } = string.Empty;
    public RoomStatus Status { get; set; } = RoomStatus.Available;

    public RoomType RoomType { get; set; } = null!;
}
