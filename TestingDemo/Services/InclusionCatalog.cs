namespace TestingDemo.Services;

/// <summary>
/// Default inclusion checklist shown when creating/editing room types and rooms.
/// Users check items that apply; they can still add or remove custom inclusions.
/// </summary>
public static class InclusionCatalog
{
    public static readonly IReadOnlyList<InclusionCategory> Categories =
    [
        new("Video and audio",
        [
            "Smart TV"
        ]),
        new("Internet and telephony",
        [
            "Wi-Fi"
        ]),
        new("Electronic devices",
        [
            "air conditioning",
            "electronic lock",
            "heater",
            "desk lamp"
        ]),
        new("Bathroom",
        [
            "toiletries",
            "bath towels"
        ]),
        new("Outdoor area and window view",
        [
            "city view",
            "no window"
        ]),
    ];

    public static IReadOnlyList<string> DefaultItems { get; } = Categories
        .SelectMany(c => c.Items)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToList();

    public static string? FindCategory(string itemName)
    {
        foreach (var category in Categories)
        {
            if (category.Items.Any(i => i.Equals(itemName, StringComparison.OrdinalIgnoreCase)))
            {
                return category.Name;
            }
        }

        return null;
    }

    /// <summary>Custom inclusions first, then catalog items in default checklist order.</summary>
    public static List<string> OrderForGuestDisplay(IEnumerable<string>? inclusions)
    {
        var normalized = RoomMappings.NormalizeInclusions(inclusions);
        if (normalized.Count == 0)
        {
            return normalized;
        }

        var catalogSet = new HashSet<string>(DefaultItems, StringComparer.OrdinalIgnoreCase);
        var custom = normalized
            .Where(i => !catalogSet.Contains(i))
            .OrderBy(i => i, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var selectedCatalog = new HashSet<string>(
            normalized.Where(catalogSet.Contains),
            StringComparer.OrdinalIgnoreCase);
        var catalogOrdered = DefaultItems
            .Where(i => selectedCatalog.Contains(i))
            .Select(i => normalized.First(l => l.Equals(i, StringComparison.OrdinalIgnoreCase)))
            .ToList();

        custom.AddRange(catalogOrdered);
        return custom;
    }
}

public sealed record InclusionCategory(string Name, IReadOnlyList<string> Items);
