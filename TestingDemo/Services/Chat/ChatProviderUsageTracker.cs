using System.Collections.Concurrent;

namespace TestingDemo.Services.Chat;

/// <summary>
/// In-process force-fallback flags per LLM provider (OCR-style).
/// Skips a provider after quota/429 until cooldown expires or UTC day rolls.
/// </summary>
public sealed class ChatProviderUsageTracker
{
    private readonly ConcurrentDictionary<ChatProviderKind, ProviderState> _states = new();
    private readonly object _ipGate = new();
    private readonly Dictionary<string, IpDayCount> _ipCounts = new(StringComparer.Ordinal);

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

    private sealed record ProviderState(DateTime UntilUtc, string Reason);
    private sealed record IpDayCount(string Day, int Count);
}
