using TestingDemo.Models;

namespace TestingDemo.Services;

public static class RoomMappings
{
    public static RoomDto ToDto(this Room room)
    {
        return new RoomDto
        {
            Id = room.Id,
            RoomTypeId = room.RoomTypeId,
            Name = room.RoomType?.Name ?? string.Empty,
            RoomNumber = room.RoomNumber,
            Description = room.RoomType?.Description,
            PricePerNight = room.RoomType?.PricePerNight ?? 0m,
            MaxOccupancy = room.RoomType?.MaxOccupancy ?? 0,
            BedCount = room.RoomType?.BedCount ?? 0,
            Status = room.Status,
            CreatedAt = room.RoomType?.CreatedAt ?? default,
            Inclusions = NormalizeInclusions(room.RoomType?.Inclusions),
            Images = NormalizeImages(room.RoomType?.Images)
        };
    }

    public static List<string> NormalizeInclusions(IEnumerable<string>? inclusions)
    {
        return (inclusions ?? Enumerable.Empty<string>())
            .Select(i => i.Trim())
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(i => i, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static List<string> NormalizeImages(IEnumerable<string>? images)
    {
        return (images ?? Enumerable.Empty<string>())
            .Select(i => i.Trim().Replace('\\', '/'))
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
