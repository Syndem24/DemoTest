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
        new("Beds",
        [
            "queen bed",
            "twin beds"
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
}

public sealed record InclusionCategory(string Name, IReadOnlyList<string> Items);
