using System.Collections.Concurrent;
using System.Text.Json;

namespace TestingDemo.Services.Chat;

/// <summary>
/// In-process force-fallback flags + soft Gemini/Groq API call counters (OCR-style App_Data file).
/// Skips a provider after quota/429 until cooldown expires.
/// </summary>
public sealed class ChatProviderUsageTracker
{
    private readonly ConcurrentDictionary<ChatProviderKind, ProviderState> _states = new();
    private readonly object _ipGate = new();
    private readonly Dictionary<string, IpDayCount> _ipCounts = new(StringComparer.Ordinal);
    private readonly string _filePath;
    private readonly object _fileGate = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public ChatProviderUsageTracker(IHostEnvironment environment)
    {
        var folder = Path.Combine(environment.ContentRootPath, "App_Data");
        Directory.CreateDirectory(folder);
        _filePath = Path.Combine(folder, "chatbot-api-usage.json");
    }

    public bool IsForceFallback(ChatProviderKind kind)
    {
        if (!_states.TryGetValue(kind, out var state))
            return false;
        if (state.UntilUtc is { } until && until > DateTime.UtcNow)
            return true;
        if (state.UntilUtc is { } expired && expired <= DateTime.UtcNow)
            _states.TryRemove(kind, out _);
        return false;
    }

    public void MarkForceFallback(ChatProviderKind kind, string reason, TimeSpan cooldown)
    {
        var until = DateTime.UtcNow.Add(cooldown <= TimeSpan.Zero ? TimeSpan.FromMinutes(30) : cooldown);
        _states[kind] = new ProviderState(until, string.IsNullOrWhiteSpace(reason) ? "quota" : reason.Trim());
    }

    public bool HasDailyQuotaRemaining(string ipKey, int maxPerDay)
    {
        if (maxPerDay <= 0)
            return true;

        var day = DateTime.UtcNow.ToString("yyyy-MM-dd");
        lock (_ipGate)
        {
            if (!_ipCounts.TryGetValue(ipKey, out var row) || row.Day != day)
                return true;
            return row.Count < maxPerDay;
        }
    }

    public bool TryConsumeDailyQuota(string ipKey, int maxPerDay)
    {
        if (maxPerDay <= 0)
            return true;

        var day = DateTime.UtcNow.ToString("yyyy-MM-dd");
        lock (_ipGate)
        {
            if (!_ipCounts.TryGetValue(ipKey, out var row) || row.Day != day)
            {
                _ipCounts[ipKey] = new IpDayCount(day, 1);
                return true;
            }

            if (row.Count >= maxPerDay)
                return false;

            _ipCounts[ipKey] = row with { Count = row.Count + 1 };
            return true;
        }
    }

    /// <summary>Record a successful Gemini or Groq API completion for dashboard consumption.</summary>
    public ChatApiConsumptionSnapshot RecordSuccessfulApiCall(ChatProviderKind kind, string? ipKey = null)
    {
        lock (_fileGate)
        {
            var snapshot = LoadFileUnlocked();
            var day = DateTime.UtcNow.ToString("yyyy-MM-dd");
            var month = DateTime.UtcNow.ToString("yyyy-MM");
            if (!string.Equals(snapshot.DayUtc, day, StringComparison.Ordinal))
            {
                snapshot.DayUtc = day;
                snapshot.CallsToday = 0;
                snapshot.GeminiCallsToday = 0;
                snapshot.GroqCallsToday = 0;
                snapshot.UniqueIpsToday = Array.Empty<string>();
            }

            if (!string.Equals(snapshot.MonthUtc, month, StringComparison.Ordinal))
            {
                snapshot.MonthUtc = month;
                snapshot.CallsMonth = 0;
                snapshot.GeminiCallsMonth = 0;
                snapshot.GroqCallsMonth = 0;
            }

            var ips = snapshot.UniqueIpsToday.ToList();
            if (!string.IsNullOrWhiteSpace(ipKey)
                && !ips.Contains(ipKey, StringComparer.Ordinal))
            {
                ips.Add(ipKey.Trim());
            }

            snapshot.CallsToday += 1;
            snapshot.CallsMonth += 1;
            if (kind == ChatProviderKind.Groq)
            {
                snapshot.GroqCallsToday += 1;
                snapshot.GroqCallsMonth += 1;
            }
            else
            {
                snapshot.GeminiCallsToday += 1;
                snapshot.GeminiCallsMonth += 1;
            }

            snapshot.LastProvider = kind.ToString();
            snapshot.LastCallUtc = DateTime.UtcNow;
            snapshot.UniqueIpsToday = ips.Take(500).ToArray();
            SaveFileUnlocked(snapshot);
            return ToPublicSnapshot(snapshot);
        }
    }

    public ChatApiConsumptionSnapshot GetApiConsumptionSnapshot()
    {
        lock (_fileGate)
        {
            return ToPublicSnapshot(LoadFileUnlocked());
        }
    }

    public ProviderFallbackInfo? GetForceFallbackInfo(ChatProviderKind kind)
    {
        if (!_states.TryGetValue(kind, out var state))
            return null;
        if (state.UntilUtc <= DateTime.UtcNow)
        {
            _states.TryRemove(kind, out _);
            return null;
        }

        return new ProviderFallbackInfo(kind, state.Reason, state.UntilUtc);
    }

    private ChatApiConsumptionSnapshot ToPublicSnapshot(UsageFileData data)
    {
        var day = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var month = DateTime.UtcNow.ToString("yyyy-MM");
        var sameDay = string.Equals(data.DayUtc, day, StringComparison.Ordinal);
        var sameMonth = string.Equals(data.MonthUtc, month, StringComparison.Ordinal);
        var callsToday = sameDay ? Math.Max(0, data.CallsToday) : 0;
        var callsMonth = sameMonth ? Math.Max(0, data.CallsMonth) : 0;
        var geminiToday = sameDay ? Math.Max(0, data.GeminiCallsToday) : 0;
        var groqToday = sameDay ? Math.Max(0, data.GroqCallsToday) : 0;
        var geminiMonth = sameMonth ? Math.Max(0, data.GeminiCallsMonth) : 0;
        var groqMonth = sameMonth ? Math.Max(0, data.GroqCallsMonth) : 0;

        // Legacy files only stored totals — attribute to Gemini so the panel is not empty.
        if (sameDay && geminiToday + groqToday == 0 && callsToday > 0)
            geminiToday = callsToday;
        if (sameMonth && geminiMonth + groqMonth == 0 && callsMonth > 0)
            geminiMonth = callsMonth;

        var ips = sameDay ? data.UniqueIpsToday : Array.Empty<string>();
        return new ChatApiConsumptionSnapshot(
            day,
            month,
            callsToday,
            callsMonth,
            geminiToday,
            groqToday,
            geminiMonth,
            groqMonth,
            ips.Length,
            data.LastProvider,
            data.LastCallUtc);
    }

    private UsageFileData LoadFileUnlocked()
    {
        var day = DateTime.UtcNow.ToString("yyyy-MM-dd");
        var month = DateTime.UtcNow.ToString("yyyy-MM");
        if (!File.Exists(_filePath))
        {
            return new UsageFileData
            {
                DayUtc = day,
                MonthUtc = month,
                UniqueIpsToday = Array.Empty<string>(),
            };
        }

        try
        {
            var json = File.ReadAllText(_filePath);
            var data = JsonSerializer.Deserialize<UsageFileData>(json, JsonOptions);
            if (data == null)
            {
                return new UsageFileData
                {
                    DayUtc = day,
                    MonthUtc = month,
                    UniqueIpsToday = Array.Empty<string>(),
                };
            }

            data.UniqueIpsToday ??= Array.Empty<string>();
            return data;
        }
        catch
        {
            return new UsageFileData
            {
                DayUtc = day,
                MonthUtc = month,
                UniqueIpsToday = Array.Empty<string>(),
            };
        }
    }

    private void SaveFileUnlocked(UsageFileData data)
    {
        var json = JsonSerializer.Serialize(data, JsonOptions);
        File.WriteAllText(_filePath, json);
    }

    private sealed record ProviderState(DateTime UntilUtc, string Reason);
    private sealed record IpDayCount(string Day, int Count);

    private sealed class UsageFileData
    {
        public string DayUtc { get; set; } = string.Empty;
        public string MonthUtc { get; set; } = string.Empty;
        public int CallsToday { get; set; }
        public int CallsMonth { get; set; }
        public int GeminiCallsToday { get; set; }
        public int GroqCallsToday { get; set; }
        public int GeminiCallsMonth { get; set; }
        public int GroqCallsMonth { get; set; }
        public string[] UniqueIpsToday { get; set; } = Array.Empty<string>();
        public string? LastProvider { get; set; }
        public DateTime? LastCallUtc { get; set; }
    }
}

public sealed record ChatApiConsumptionSnapshot(
    string DayUtc,
    string MonthUtc,
    int CallsToday,
    int CallsMonth,
    int GeminiCallsToday,
    int GroqCallsToday,
    int GeminiCallsMonth,
    int GroqCallsMonth,
    int UniqueGuestIpsToday,
    string? LastProvider,
    DateTime? LastCallUtc);

public sealed record ProviderFallbackInfo(
    ChatProviderKind Kind,
    string Reason,
    DateTime UntilUtc);
