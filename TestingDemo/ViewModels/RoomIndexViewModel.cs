using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class RoomIndexViewModel
{
    public IReadOnlyList<RoomTypeSummaryViewModel> RoomTypes { get; set; } = Array.Empty<RoomTypeSummaryViewModel>();

    public static RoomIndexViewModel FromRooms(IReadOnlyList<RoomDto> rooms)
    {
        return new RoomIndexViewModel
        {
            RoomTypes = BuildRoomTypes(rooms)
        };
    }

    public static IReadOnlyList<RoomTypeGroupViewModel> BuildRoomGroups(IReadOnlyList<RoomDto> rooms)
    {
        return rooms
            .GroupBy(r => new { r.RoomTypeId, r.Name })
            .OrderBy(g => g.Key.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new RoomTypeGroupViewModel
            {
                RoomTypeId = g.Key.RoomTypeId,
                Name = g.Key.Name,
                Rooms = g.OrderBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase).ToList()
            })
            .ToList();
    }

    private static IReadOnlyList<RoomTypeSummaryViewModel> BuildRoomTypes(IReadOnlyList<RoomDto> rooms)
    {
        return BuildRoomGroups(rooms)
            .Select(g =>
            {
                var representative = g.Rooms.First();
                return new RoomTypeSummaryViewModel
                {
                    RoomTypeId = g.RoomTypeId,
                    Name = g.Name,
                    Description = representative.Description,
                    PricePerNight = representative.PricePerNight,
                    MaxOccupancy = representative.MaxOccupancy,
                    BedCount = representative.BedCount,
                    SizeSqm = representative.SizeSqm,
                    RoomCount = g.Rooms.Count,
                    AvailableCount = g.Rooms.Count(r => r.IsAvailable),
                    Inclusions = representative.Inclusions.ToList(),
                    Images = representative.Images.ToList()
                };
            })
            .ToList();
    }
}

public class RoomListViewModel
{
    public IReadOnlyList<RoomTypeGroupViewModel> RoomGroups { get; set; } = Array.Empty<RoomTypeGroupViewModel>();

    public static RoomListViewModel FromRooms(IReadOnlyList<RoomDto> rooms)
    {
        return new RoomListViewModel
        {
            RoomGroups = RoomIndexViewModel.BuildRoomGroups(rooms)
        };
    }
}

public class RoomTypeSummaryViewModel
{
    public int RoomTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerNight { get; set; }
    public int MaxOccupancy { get; set; }
    public int BedCount { get; set; }
    public double? SizeSqm { get; set; }
    public int RoomCount { get; set; }
    public int AvailableCount { get; set; }
    public List<string> Inclusions { get; set; } = new();
    public List<string> Images { get; set; } = new();
}

public class RoomTypeGroupViewModel
{
    public int RoomTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public IReadOnlyList<RoomDto> Rooms { get; set; } = Array.Empty<RoomDto>();
}
