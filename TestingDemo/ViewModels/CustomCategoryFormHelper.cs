using System.Text.Json;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public static class CustomCategoryFormHelper
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static List<CustomInclusionCategory> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return new List<CustomInclusionCategory>();
        }

        try
        {
            return JsonSerializer.Deserialize<List<CustomInclusionCategory>>(json, JsonOptions)
                   ?? new List<CustomInclusionCategory>();
        }
        catch (JsonException)
        {
            return new List<CustomInclusionCategory>();
        }
    }
}
