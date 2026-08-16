using System.Text.Json;

namespace TestingDemo.Services;

/// <summary>
/// Soft monthly Azure OCR page counter persisted under App_Data/ocr-usage.json.
/// Also stores a force-fallback flag when Azure returns quota/rate-limit errors.
/// </summary>
public sealed class OcrUsageTracker
{
    private readonly string _filePath;
    private readonly object _gate = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public OcrUsageTracker(IHostEnvironment environment)
    {
        var folder = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(folder);
        _filePath = Path.Combine(folder, "ocr-usage.json");
    }

    public UsageSnapshot GetSnapshot()
    {
        lock (_gate)
        {
            return LoadUnlocked();
        }
    }

    public bool TryReservePage(int budget, out UsageSnapshot snapshot)
    {
        lock (_gate)
        {
            snapshot = LoadUnlocked();
            if (snapshot.ForceFallback)
            {
                return false;
            }

            if (snapshot.PagesUsed >= budget)
            {
                return false;
            }

            return true;
        }
    }

    public UsageSnapshot RecordSuccess(int pages = 1)
    {
        lock (_gate)
        {
            var snapshot = LoadUnlocked();
            snapshot = snapshot with { PagesUsed = snapshot.PagesUsed + Math.Max(1, pages) };
            SaveUnlocked(snapshot);
            return snapshot;
        }
    }

    public UsageSnapshot MarkForceFallback(string reason)
    {
        lock (_gate)
        {
            var snapshot = LoadUnlocked() with
            {
                ForceFallback = true,
                ForceFallbackReason = string.IsNullOrWhiteSpace(reason)
                    ? "Azure quota or rate limit"
                    : reason.Trim(),
            };
            SaveUnlocked(snapshot);
            return snapshot;
        }
    }

    private UsageSnapshot LoadUnlocked()
    {
        var monthKey = DateTime.UtcNow.ToString("yyyy-MM");
        if (!File.Exists(_filePath))
        {
            return new UsageSnapshot(monthKey, 0, false, null);
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var data = JsonSerializer.Deserialize<UsageFile>(json, JsonOptions);
            if (data == null || string.IsNullOrWhiteSpace(data.YearMonth))
            {
                return new UsageSnapshot(monthKey, 0, false, null);
            }

            if (!string.Equals(data.YearMonth, monthKey, StringComparison.Ordinal))
            {
                // New calendar month — reset counter and force-fallback.
                return new UsageSnapshot(monthKey, 0, false, null);
            }

            return new UsageSnapshot(
                data.YearMonth,
                Math.Max(0, data.PagesUsed),
                data.ForceFallback,
                data.ForceFallbackReason);
        }
        catch
        {
            return new UsageSnapshot(monthKey, 0, false, null);
        }
    }

    private void SaveUnlocked(UsageSnapshot snapshot)
    {
        var data = new UsageFile
        {
            YearMonth = snapshot.YearMonth,
            PagesUsed = snapshot.PagesUsed,
            ForceFallback = snapshot.ForceFallback,
            ForceFallbackReason = snapshot.ForceFallbackReason,
        };
        var json = JsonSerializer.Serialize(data, JsonOptions);
        File.WriteAllText(_filePath, json);
    }

    public sealed record UsageSnapshot(
        string YearMonth,
        int PagesUsed,
        bool ForceFallback,
        string? ForceFallbackReason);

    private sealed class UsageFile
    {
        public string YearMonth { get; set; } = string.Empty;
        public int PagesUsed { get; set; }
        public bool ForceFallback { get; set; }
        public string? ForceFallbackReason { get; set; }
    }
}
