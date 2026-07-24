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
            Name = room.RoomType?.TypeName ?? string.Empty,
            RoomNumber = room.RoomNumber,
            Description = room.RoomType?.Description,
            PricePerNight = room.PricePerNight,
            MaxOccupancy = room.MaxOccupancy,
            BedCount = room.BedCount,
            Status = room.Status,
            CreatedAt = room.RoomType?.CreatedAt ?? default,
            Inclusions = NormalizeInclusions(room.RoomType?.Inclusions),
            CustomCategories = NormalizeCustomCategories(room.RoomType?.CustomCategories),
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

    public static List<CustomInclusionCategory> NormalizeCustomCategories(
        IEnumerable<CustomInclusionCategory>? categories)
    {
        return (categories ?? Enumerable.Empty<CustomInclusionCategory>())
            .Select(c => new CustomInclusionCategory
            {
                Name = (c.Name ?? string.Empty).Trim(),
                Items = NormalizeInclusions(c.Items)
            })
            .Where(c => !string.IsNullOrWhiteSpace(c.Name))
            .GroupBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g => new CustomInclusionCategory
            {
                Name = g.First().Name,
                Items = NormalizeInclusions(g.SelectMany(c => c.Items))
            })
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
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
