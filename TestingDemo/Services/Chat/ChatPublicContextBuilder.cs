using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using TestingDemo.Models;
using TestingDemo.Options;

namespace TestingDemo.Services.Chat;

public interface IChatPublicContextBuilder
{
    Task<string> BuildAsync(CancellationToken cancellationToken = default);
    string BuildDeskReply(string? preface = null);
}

public sealed class ChatPublicContextBuilder : IChatPublicContextBuilder
{
    private readonly IRoomService _rooms;
    private readonly ISpecialOfferService _offers;
    private readonly ChatbotOptions _options;
    private readonly IMemoryCache _cache;

    private const string CacheKey = "chatbot.public-context.v1";

    public ChatPublicContextBuilder(
        IRoomService rooms,
        ISpecialOfferService offers,
        IOptions<ChatbotOptions> options,
        IMemoryCache cache)
    {
        _rooms = rooms;
        _offers = offers;
        _options = options.Value;
        _cache = cache;
    }

    public async Task<string> BuildAsync(CancellationToken cancellationToken = default)
    {
        if (_cache.TryGetValue(CacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
            return cached;

        var profile = _options.PublicProfile;
        var rooms = await _rooms.GetAllAsync(cancellationToken);
        var available = rooms
            .Where(r => r.Status == RoomStatus.Available)
            .GroupBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var sample = g.First();
                return new
                {
                    Type = sample.Name,
                    AvailableCount = g.Count(),
                    PricePerNight = sample.PricePerNight,
                    MaxOccupancy = sample.MaxOccupancy,
                    BedCount = sample.BedCount,
                    Inclusions = sample.Inclusions,
                    Description = Trim(sample.Description, 280)
                };
            })
            .OrderBy(x => x.Type, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var offers = (await _offers.GetActiveForGuestAsync(null, cancellationToken))
            .Select(o => new
            {
                o.Title,
                Description = Trim(o.Description, 220),
                o.RoomTypeName,
                Kind = o.Kind.ToString(),
                o.RegularPricePerNight,
                o.PromoPricePerNight,
                o.MinNights,
                Ends = o.OpenEnded ? "open-ended" : o.EndsAtUtc.ToString("yyyy-MM-dd")
            })
            .ToList();

        var sb = new StringBuilder(2048);
        sb.AppendLine($"Hotel: {profile.HotelName}");
        sb.AppendLine($"Address: {profile.Address}");
        sb.AppendLine($"Phones: {profile.PhonePrimary}; {profile.PhoneSecondary}");
        sb.AppendLine($"Check-in: {profile.CheckIn} (early option {profile.EarlyCheckIn}); Check-out: {profile.CheckOut}");
        sb.AppendLine($"Book online: {profile.BookPath}");
        sb.AppendLine("Available room types (no physical room numbers):");
        if (available.Count == 0)
        {
            sb.AppendLine("- None listed as available right now. Suggest calling the desk.");
        }
        else
        {
            foreach (var row in available)
            {
                sb.Append("- ")
                    .Append(row.Type)
                    .Append(": ₱")
                    .Append(row.PricePerNight.ToString("0.##"))
                    .Append("/night, max ")
                    .Append(row.MaxOccupancy)
                    .Append(" guests, ")
                    .Append(row.BedCount)
                    .Append(" bed(s), ")
                    .Append(row.AvailableCount)
                    .Append(" available");
                if (row.Inclusions.Count > 0)
                    sb.Append("; inclusions: ").Append(string.Join(", ", row.Inclusions.Take(8)));
                if (!string.IsNullOrWhiteSpace(row.Description))
                    sb.Append("; ").Append(row.Description);
                sb.AppendLine();
            }
        }

        sb.AppendLine("Guest-visible offers:");
        if (offers.Count == 0)
        {
            sb.AppendLine("- None active.");
        }
        else
        {
            foreach (var o in offers.Take(12))
            {
                sb.Append("- ")
                    .Append(o.Title)
                    .Append(" (")
                    .Append(o.RoomTypeName)
                    .Append(", ")
                    .Append(o.Kind)
                    .Append(')');
                if (o.PromoPricePerNight is { } promo)
                    sb.Append(" promo ₱").Append(promo.ToString("0.##"));
                if (o.MinNights is { } min)
                    sb.Append(" min ").Append(min).Append(" nights");
                sb.Append(" ends ").Append(o.Ends);
                if (!string.IsNullOrWhiteSpace(o.Description))
                    sb.Append(" — ").Append(o.Description);
                sb.AppendLine();
            }
        }

        var text = sb.ToString();
        _cache.Set(CacheKey, text, TimeSpan.FromSeconds(90));
        return text;
    }

    public string BuildDeskReply(string? preface = null)
    {
        var p = _options.PublicProfile;
        var lead = string.IsNullOrWhiteSpace(preface)
            ? "I cannot complete that right now. Please contact the front desk."
            : preface.Trim();
        return $"{lead} Call {p.PhonePrimary} or {p.PhoneSecondary}. You can also book on the Accommodations page.";
    }

    private static string? Trim(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        var t = Regex.Replace(value.Trim(), @"\s+", " ");
        return t.Length <= max ? t : t[..(max - 1)] + "…";
    }
}
