using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using TestingDemo.Models;
using TestingDemo.Options;

namespace TestingDemo.Services.Chat;

public interface IChatRuleEngine
{
    Task<string?> TryRuleBasedReplyAsync(
        string matchText,
        string? originalText = null,
        CancellationToken cancellationToken = default);

    string BuildUnknownTopicReply();
    string BuildUnclearInputReply();
}

public sealed class ChatRuleEngine : IChatRuleEngine
{
    private readonly IRoomService _rooms;
    private readonly ISpecialOfferService _offers;
    private readonly IStayReviewService _reviews;
    private readonly ChatbotOptions _options;

    private static readonly Regex DigitsOnly = new(@"^\d{4,}$", RegexOptions.Compiled);
    private static readonly Regex Gibberish = new(@"^[a-z]{10,}$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HasDateHint = new(
        @"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}[\/\-.]\d{1,2}|check[- ]?in|check[- ]?out|night|nights)\b|月|日|入住|退房",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public ChatRuleEngine(
        IRoomService rooms,
        ISpecialOfferService offers,
        IStayReviewService reviews,
        IOptions<ChatbotOptions> options)
    {
        _rooms = rooms;
        _offers = offers;
        _reviews = reviews;
        _options = options.Value;
    }

    public async Task<string?> TryRuleBasedReplyAsync(
        string matchText,
        string? originalText = null,
        CancellationToken cancellationToken = default)
    {
        var english = Normalize(matchText);
        var original = Normalize(originalText ?? string.Empty);
        var haystack = string.IsNullOrEmpty(original) || original == english
            ? english
            : english + "\n" + original;

        if (haystack.Length == 0)
            return null;

        if (IsConversationalOpener(english, original) && !LooksLikeHotelFaq(haystack))
            return BuildInviteReply();

        if (LooksUnclear(english, original))
            return BuildUnclearInputReply();

        // Book before rooms so “book a twin room for Sep 20” guides to Accommodations.
        if (MatchesAny(
                haystack,
                "book",
                "booking",
                "reserve",
                "reservation",
                "how to book",
                "accommodations",
                "预订",
                "訂房",
                "订房",
                "予約",
                "예약"))
        {
            return HasDateHint.IsMatch(haystack)
                ? BuildBookWithDatesReply()
                : BuildBookReply();
        }

        // Breakfast / inclusions before generic “room” (e.g. Korean 조식 포함).
        if (MatchesAny(
                haystack,
                "breakfast",
                "inclusion",
                "inclusions",
                "included",
                "amenit",
                "조식",
                "포함",
                "朝食",
                "含早",
                "포함되어"))
            return await BuildInclusionsReplyAsync(cancellationToken);

        if (MatchesAny(
                haystack,
                "room",
                "rooms",
                "available",
                "accommodation",
                "suite",
                "bed",
                "occupancy",
                "twin",
                "queen",
                "double",
                "房间",
                "客房",
                "双人",
                "空房",
                "部屋",
                "ルーム",
                "객실"))
            return await BuildRoomsReplyAsync(cancellationToken);

        if (MatchesAny(
                haystack,
                "price",
                "rate",
                "rates",
                "cost",
                "how much",
                "peso",
                "php",
                "fee",
                "价格",
                "多少钱",
                "房价",
                "料金",
                "価格",
                "가격",
                "요금"))
            return await BuildRatesReplyAsync(cancellationToken);

        if (MatchesAny(
                haystack,
                "offer",
                "offers",
                "promo",
                "discount",
                "deal",
                "loyalty",
                "优惠",
                "促销",
                "キャンペーン",
                "割引",
                "할인"))
            return await BuildOffersReplyAsync(cancellationToken);

        if (MatchesAny(
                haystack,
                "pay",
                "payment",
                "receipt",
                "gcash",
                "bank transfer",
                "how to pay",
                "支付",
                "付款",
                "支払い",
                "결제"))
            return BuildPaymentReply();

        if (MatchesAny(
                haystack,
                "location",
                "address",
                "where",
                "map",
                "mandaue",
                "cebu",
                "fortuna",
                "direction",
                "地址",
                "位置",
                "在哪",
                "住所",
                "場所",
                "어디",
                "주소"))
            return BuildLocationReply();

        if (MatchesAny(
                haystack,
                "check-in",
                "check in",
                "checkin",
                "check-out",
                "check out",
                "checkout",
                "early check",
                "入住",
                "退房",
                "チェックイン",
                "チェックアウト",
                "체크인",
                "체크아웃"))
            return BuildStayTimesReply();

        if (MatchesAny(
                haystack,
                "phone",
                "contact",
                "call",
                "front desk",
                "reception",
                "电话",
                "联系",
                "前台",
                "電話",
                "連絡",
                "フロント",
                "전화",
                "연락"))
            return BuildContactReply();

        if (MatchesAny(
                haystack,
                "wifi",
                "wi-fi",
                "internet",
                "password",
                "无线网",
                "无线网络",
                "와이파이"))
            return BuildWifiReply();

        if (MatchesAny(
                haystack,
                "review",
                "reviews",
                "rating",
                "feedback",
                "guest say",
                "评价",
                "评论",
                "レビュー",
                "리뷰"))
            return await BuildReviewsReplyAsync(cancellationToken);

        if (MatchesAny(haystack, "thank", "thanks", "谢谢", "謝謝", "ありがとう", "감사"))
            return "You’re welcome. Ask anytime about rooms, rates, offers, check-in, location, or booking.";

        return null;
    }

    public string BuildUnknownTopicReply()
    {
        var p = _options.PublicProfile;
        return
            $"I’m not sure about that topic. I can help with rooms, rates, offers, check-in times, location, reviews, and how to book. "
            + $"Or call the front desk at {p.PhonePrimary} / {p.PhoneSecondary}.";
    }

    public string BuildUnclearInputReply() =>
        "I didn’t catch a hotel question there. Ask about rooms, rates, offers, check-in, location, or how to book — or call the front desk.";

    private static string BuildInviteReply() =>
        "Of course — ask me about rooms, rates, offers, check-in, location, or how to book. I cannot look up personal reservations in chat.";

    private async Task<string> BuildRoomsReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesAsync(cancellationToken);
        var p = _options.PublicProfile;
        if (types.Count == 0)
        {
            return
                $"No room types are listed as available online right now. Please call {p.PhonePrimary} or book on the Accommodations page.";
        }

        var sb = new StringBuilder();
        sb.Append("Available room types at ").Append(p.HotelName).AppendLine(":");
        foreach (var t in types)
        {
            sb.Append("- ")
                .Append(t.Name)
                .Append(": ₱")
                .Append(t.PricePerNight.ToString("0.##", CultureInfo.InvariantCulture))
                .Append("/night, up to ")
                .Append(t.MaxOccupancy)
                .Append(" guests (")
                .Append(t.AvailableCount)
                .AppendLine(" available).");
        }

        sb.Append("Book on the Accommodations page. I do not share physical room numbers in chat.");
        return sb.ToString();
    }

    private async Task<string> BuildRatesReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesAsync(cancellationToken);
        if (types.Count == 0)
            return BuildUnknownTopicReply();

        var sb = new StringBuilder("Current online rates (per night, available types):");
        sb.AppendLine();
        foreach (var t in types)
        {
            sb.Append("- ")
                .Append(t.Name)
                .Append(": ₱")
                .Append(t.PricePerNight.ToString("0.##", CultureInfo.InvariantCulture))
                .AppendLine("/night");
        }

        sb.Append("Extra fees (early check-in, late checkout, extra person) may apply at booking. See Accommodations to book.");
        return sb.ToString();
    }

    private async Task<string> BuildOffersReplyAsync(CancellationToken cancellationToken)
    {
        var offers = await _offers.GetActiveForGuestAsync(null, cancellationToken);
        if (offers.Count == 0)
            return "There are no guest offers active online right now. Check Accommodations for current rates, or ask the front desk.";

        var sb = new StringBuilder("Guest offers available online:");
        sb.AppendLine();
        foreach (var o in offers.Take(8))
        {
            sb.Append("- ").Append(o.Title).Append(" (").Append(o.RoomTypeName).Append(')');
            if (o.PromoPricePerNight is { } promo)
                sb.Append(" — promo ₱").Append(promo.ToString("0.##", CultureInfo.InvariantCulture)).Append("/night");
            if (o.MinNights is { } min)
                sb.Append(", min ").Append(min).Append(" nights");
            sb.AppendLine();
        }

        sb.Append("Open Accommodations to apply an offer when you book.");
        return sb.ToString();
    }

    private string BuildBookReply()
    {
        var p = _options.PublicProfile;
        return
            $"To book online, open the Accommodations page ({p.BookPath}), pick dates and a room type, then continue the booking flow. "
            + "Near arrival you may get a booking instead of a longer-lead reservation. For help, call "
            + $"{p.PhonePrimary}.";
    }

    private string BuildBookWithDatesReply()
    {
        var p = _options.PublicProfile;
        return
            $"I can guide you, but I cannot complete a booking in chat. Open the Accommodations page ({p.BookPath}), "
            + "enter your check-in and check-out dates, choose a room type (for example Twin or Queen), and continue. "
            + $"Need help? Call {p.PhonePrimary}.";
    }

    private async Task<string> BuildInclusionsReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesWithInclusionsAsync(cancellationToken);
        if (types.Count == 0)
        {
            return
                "I don’t have inclusion details online right now. Breakfast and other amenities depend on the room type — "
                + "check Accommodations or ask the front desk.";
        }

        var sb = new StringBuilder("Room-type inclusions (from Room Management):");
        sb.AppendLine();
        foreach (var t in types)
        {
            sb.Append("- ").Append(t.Name).Append(": ");
            if (t.Inclusions.Count == 0)
                sb.AppendLine("no inclusions listed online (ask the desk about breakfast).");
            else
                sb.AppendLine(string.Join(", ", t.Inclusions));
        }

        sb.Append("If breakfast is not listed above, it is not included in the listed rate by default.");
        return sb.ToString();
    }

    private string BuildPaymentReply()
    {
        var p = _options.PublicProfile;
        return
            "Online stays follow the payment steps shown in your booking flow (including receipt upload when required). "
            + "I cannot look up a payment status in chat. For payment help, call "
            + $"{p.PhonePrimary} or {p.PhoneSecondary}.";
    }

    private string BuildLocationReply()
    {
        var p = _options.PublicProfile;
        return $"{p.HotelName} is at {p.Address}. Call {p.PhonePrimary} or {p.PhoneSecondary} for directions.";
    }

    private string BuildStayTimesReply()
    {
        var p = _options.PublicProfile;
        return
            $"Standard check-in is {p.CheckIn} (early option {p.EarlyCheckIn} when offered). "
            + $"Standard check-out is {p.CheckOut}. Early check-in and late checkout may add fees — see the booking form.";
    }

    private string BuildContactReply()
    {
        var p = _options.PublicProfile;
        return $"Front desk: {p.PhonePrimary} or {p.PhoneSecondary}. Hotel: {p.HotelName}, {p.Address}.";
    }

    private string BuildWifiReply() =>
        "Guest Wi‑Fi is available as a hotel amenity. The exact network name and password are provided at check-in or by the front desk — I do not share staff credentials in chat.";

    private async Task<string> BuildReviewsReplyAsync(CancellationToken cancellationToken)
    {
        try
        {
            var page = await _reviews.GetPublicAsync(6, cancellationToken);
            var count = page.ReviewCount;
            if (count == 0 || page.Items.Count == 0)
                return "Guest reviews appear on the hotel home page when published. I don’t invent ratings in chat.";

            var avg = page.AverageOverall;
            return
                $"We currently show {count} public guest review(s)"
                + (avg > 0 ? $" (about {avg:0.0}/5 average)" : string.Empty)
                + ". Scroll to Reviews on the home page to read them.";
        }
        catch
        {
            return "Guest reviews appear on the hotel home page when published.";
        }
    }

    private async Task<IReadOnlyList<RoomTypeSummary>> GetAvailableTypesAsync(CancellationToken cancellationToken)
    {
        var detailed = await GetAvailableTypesWithInclusionsAsync(cancellationToken);
        return detailed
            .Select(t => new RoomTypeSummary(t.Name, t.PricePerNight, t.MaxOccupancy, t.AvailableCount))
            .ToList();
    }

    private async Task<IReadOnlyList<RoomTypeInclusionSummary>> GetAvailableTypesWithInclusionsAsync(
        CancellationToken cancellationToken)
    {
        var rooms = await _rooms.GetAllAsync(cancellationToken);
        return rooms
            .Where(r => r.Status == RoomStatus.Available)
            .GroupBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var sample = g.First();
                var inclusions = sample.Inclusions?.Where(i => !string.IsNullOrWhiteSpace(i)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
                                 ?? new List<string>();
                return new RoomTypeInclusionSummary(
                    sample.Name,
                    sample.PricePerNight,
                    sample.MaxOccupancy,
                    g.Count(),
                    inclusions);
            })
            .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool IsConversationalOpener(string english, string original)
    {
        foreach (var probe in new[] { english, original })
        {
            if (string.IsNullOrWhiteSpace(probe))
                continue;
            var t = probe.Trim();
            if (t is "hi" or "hey" or "hello" or "yo" or "你好" or "您好" or "こんにちは" or "안녕")
                return true;
            if (MatchesAny(
                    t,
                    "can i ask",
                    "can you help",
                    "could you help",
                    "i have a question",
                    "ask you something",
                    "ask u something",
                    "good morning",
                    "good afternoon",
                    "good evening",
                    "请问",
                    "助けて",
                    "도와줘"))
                return true;
        }

        return false;
    }

    private static bool LooksLikeHotelFaq(string haystack) =>
        MatchesAny(
            haystack,
            "room",
            "book",
            "price",
            "rate",
            "check",
            "offer",
            "location",
            "wifi",
            "review",
            "pay",
            "breakfast",
            "inclusion",
            "조식",
            "포함",
            "预订",
            "房间",
            "入住",
            "価格",
            "部屋",
            "예약",
            "객실");

    private static bool LooksUnclear(string english, string original)
    {
        var probe = string.IsNullOrWhiteSpace(english) ? original : english;
        probe = probe.Trim();
        if (probe.Length == 0)
            return true;
        if (DigitsOnly.IsMatch(probe))
            return true;
        if (Gibberish.IsMatch(probe) && !probe.Contains(' '))
            return true;
        return false;
    }

    private static string Normalize(string text)
    {
        var t = text.Trim().ToLowerInvariant();
        return Regex.Replace(t, @"\s+", " ");
    }

    private static bool MatchesAny(string text, params string[] keywords) =>
        keywords.Any(k => text.Contains(k, StringComparison.Ordinal));

    private sealed record RoomTypeSummary(string Name, decimal PricePerNight, int MaxOccupancy, int AvailableCount);

    private sealed record RoomTypeInclusionSummary(
        string Name,
        decimal PricePerNight,
        int MaxOccupancy,
        int AvailableCount,
        IReadOnlyList<string> Inclusions);
}
