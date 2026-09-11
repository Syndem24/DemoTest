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
    /// <summary>Warm multi-part answer when Gemini/Groq both miss a complex guest message.</summary>
    string BuildComplexAiMissReply();
    bool TryLanguageSwitchReply(string original, string matchText, string replyLanguage, out string reply);
    string? TryNativeCebuanoReply(string englishReply);
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
                "payment method",
                "payment methods",
                "how to pay",
                "receipt",
                "gcash",
                "maya",
                "paymaya",
                "pay maya",
                "e-wallet",
                "ewallet",
                "instapay",
                "qr",
                "bank transfer",
                "cash",
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
            return "You’re so welcome — it’s our pleasure. Whenever you’re ready, I’m here for rooms, rates, booking help, or anything else about your stay.";

        return null;
    }

    public string BuildUnknownTopicReply()
    {
        var p = _options.PublicProfile;
        return
            $"I’d love to help with that, though I’m best with rooms, rates, offers, check-in times, our location, reviews, and how to book online. "
            + $"If you need something more personal, our front desk is happy to assist at {p.PhonePrimary} or {p.PhoneSecondary}.";
    }

    public string BuildComplexAiMissReply()
    {
        var p = _options.PublicProfile;
        return
            $"Thank you for such a thoughtful note — I’d love to cover each part. "
            + $"You’ll find Twin, Queen, and other room types on Accommodations ({p.BookPath}), with inclusions listed on each card. "
            + $"Standard check-in is {p.CheckIn} (early option around {p.EarlyCheckIn} when available) and check-out is {p.CheckOut}. "
            + "Guest Wi‑Fi is included; you’ll get the network details at check-in. "
            + $"For parking or a weekend with a child, please call {p.PhonePrimary} or {p.PhoneSecondary} and we’ll plan it with you warmly — "
            + "or pick your dates on Accommodations to book online.";
    }

    public bool TryLanguageSwitchReply(
        string original,
        string matchText,
        string replyLanguage,
        out string reply)
    {
        reply = string.Empty;
        var hay = $"{original} {matchText}".ToLowerInvariant();
        var asksBisaya =
            hay.Contains("bisaya", StringComparison.Ordinal)
            || hay.Contains("binisaya", StringComparison.Ordinal)
            || hay.Contains("cebuano", StringComparison.Ordinal)
            || hay.Contains("sugbuanon", StringComparison.Ordinal);
        var asksSpeak =
            hay.Contains("speak", StringComparison.Ordinal)
            || hay.Contains("talk", StringComparison.Ordinal)
            || hay.Contains("reply", StringComparison.Ordinal)
            || hay.Contains("answer", StringComparison.Ordinal)
            || hay.Contains("can you", StringComparison.Ordinal)
            || hay.Contains("pwede", StringComparison.Ordinal)
            || hay.Contains("in bisaya", StringComparison.Ordinal);

        if (!asksBisaya || !asksSpeak)
            return false;

        reply =
            "Oo, mahimo! Mutubag ko nimo sa Binisaya aron mas komportable ka. "
            + "Pangutana lang bahin sa mga lawak, rates, check-in, lokasyon, o unsáon pag-book — ania ra ko aron mutabang.";
        return true;
    }

    public string? TryNativeCebuanoReply(string englishReply)
    {
        if (string.IsNullOrWhiteSpace(englishReply))
            return null;

        var text = englishReply;
        var p = _options.PublicProfile;

        if (text.Contains("Open Accommodations", StringComparison.OrdinalIgnoreCase)
            && (text.Contains("delighted to help you book", StringComparison.OrdinalIgnoreCase)
                || text.Contains("choose your dates", StringComparison.OrdinalIgnoreCase)
                || text.Contains("gentle steps", StringComparison.OrdinalIgnoreCase)))
        {
            return
                $"Malipayon ko nga mutabang nimo mag-book. Ablihi ang Accommodations ({p.BookPath}), "
                + "pilia ang imong check-in ug check-out, dayon ang klase sa lawak, ug sunda lang ang mga lakang sa screen. "
                + $"Kung duol na ang imong pag-abot, mahimong dayon ang booking. Kinahanglan og tawag? {p.PhonePrimary} — ania mi para nimo.";
        }

        if (text.Contains("sharing your plans", StringComparison.OrdinalIgnoreCase)
            || text.Contains("finish the booking inside this chat", StringComparison.OrdinalIgnoreCase))
        {
            return
                $"Salamat sa imong plano — mutudlo ko nimo, apan dili mahimo ang booking dinhi sa chat. "
                + $"Palihog ablihi ang Accommodations ({p.BookPath}), isulod ang imong mga petsa, pilia ang lawak (Twin, Queen, ug uban pa), ug padayon. "
                + $"Kung dili klaro, tawag sa {p.PhonePrimary} ug tabangan ka namo og malipayon.";
        }

        if (text.Contains("Standard check-in is", StringComparison.OrdinalIgnoreCase)
            || (text.Contains("check-in is", StringComparison.OrdinalIgnoreCase)
                && text.Contains("Check-out is", StringComparison.OrdinalIgnoreCase)))
        {
            return
                $"Ang regular nga check-in kay {p.CheckIn}, ug early check-in mga {p.EarlyCheckIn} kung available. "
                + $"Check-out kay {p.CheckOut}. Mahimong adunay gamay nga fee sa early check-in o late checkout — makita nimo kini samtang mag-book.";
        }

        if (text.Contains("guest Wi‑Fi", StringComparison.OrdinalIgnoreCase)
            || text.Contains("Guest Wi‑Fi", StringComparison.Ordinal)
            || text.Contains("Wi‑Fi is part of", StringComparison.OrdinalIgnoreCase))
        {
            return
                "Oo — adunay guest Wi‑Fi para sa komportable nimong pagpuyo. "
                + "Ihatag namo ang network name ug password sa check-in o sa front desk. "
                + "Dili ko magpakita og staff password dinhi, apan malipayon ming mutabang aron makakonekta ka.";
        }

        if (text.Contains("We don’t take payment online", StringComparison.OrdinalIgnoreCase)
            || text.Contains("We don't take payment online", StringComparison.OrdinalIgnoreCase)
            || (text.Contains("GCash", StringComparison.OrdinalIgnoreCase)
                && text.Contains("PayMaya", StringComparison.OrdinalIgnoreCase)
                && text.Contains("front desk", StringComparison.OrdinalIgnoreCase)))
        {
            return
                "Wala mi’y online nga bayad — tanan sa front desk ra. "
                + "Pwede ka magbayad og cash, o QR sa counter gamit ang GCash o PayMaya (InstaPay). "
                + "Mao ra na ang among paagi sa pagbayad. "
                + $"Kung kinahanglan nimo og tabang sa pag-abot, tawag sa {p.PhonePrimary} o {p.PhoneSecondary} — atimanon ka namo.";
        }

        if (text.Contains("I care about getting your stay details right", StringComparison.OrdinalIgnoreCase))
        {
            return
                "Gusto nako nga hustó ang imong detalye sa pagpuyo, busa dili ko makatan-aw, makausab, o makakansela "
                + "sa personal nga booking o bayad dinhi sa chat. Palihog tawag sa front desk, o sign in ug ablihi ang Booking history — atimanon ka namo didto.";
        }

        if (text.Contains("I’d love to help with that, though I’m best with rooms", StringComparison.OrdinalIgnoreCase))
        {
            return
                $"Gusto ko gyud mutabang — pinakamaayo ko sa mga lawak, rates, offers, oras sa check-in, lokasyon, reviews, ug unsáon pag-book online. "
                + $"Kung personal na nga butang, tawag sa {p.PhonePrimary} o {p.PhoneSecondary} — malipayon ang among front desk.";
        }

        return null;
    }

    public string BuildUnclearInputReply() =>
        "I want to make sure I help you well — could you share a little more? For example rooms, rates, check-in, location, or how to book. I’m right here with you.";

    private static string BuildInviteReply() =>
        "Of course — I’m glad you reached out. Ask me anything about rooms, rates, offers, check-in, finding us, or booking online. "
        + "For your own reservation details, sign in to Booking history or call our front desk — I’ll still guide you to the right place.";

    private async Task<string> BuildRoomsReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesAsync(cancellationToken);
        var p = _options.PublicProfile;
        if (types.Count == 0)
        {
            return
                $"I’m sorry — we don’t have room types showing as available online at the moment. "
                + $"Please call us at {p.PhonePrimary}, or check the Accommodations page again soon. We’ll take good care of you.";
        }

        var sb = new StringBuilder();
        sb.Append("Here’s what we can offer you online at ").Append(p.HotelName).AppendLine(" right now:");
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
                .AppendLine(" open).");
        }

        sb.Append("When you’re ready, book on the Accommodations page — I don’t share physical room numbers here, but our team will assign yours warmly on arrival.");
        return sb.ToString();
    }

    private async Task<string> BuildRatesReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesAsync(cancellationToken);
        if (types.Count == 0)
            return BuildUnknownTopicReply();

        var sb = new StringBuilder("Here are tonight’s online rates for available room types:");
        sb.AppendLine();
        foreach (var t in types)
        {
            sb.Append("- ")
                .Append(t.Name)
                .Append(": ₱")
                .Append(t.PricePerNight.ToString("0.##", CultureInfo.InvariantCulture))
                .AppendLine("/night");
        }

        sb.Append("A few stay fees (early check-in, late checkout, or an extra person) may apply when you book — you’ll see them clearly on Accommodations.");
        return sb.ToString();
    }

    private async Task<string> BuildOffersReplyAsync(CancellationToken cancellationToken)
    {
        var offers = await _offers.GetActiveForGuestAsync(null, cancellationToken);
        if (offers.Count == 0)
            return "We don’t have a special guest offer live online right now, but our regular rates on Accommodations are ready for you — or ask the front desk if you’re hoping for something particular.";

        var sb = new StringBuilder("We’re glad to share these guest offers available online:");
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

        sb.Append("Open Accommodations to apply an offer while you book — we’re happy you’re considering a stay with us.");
        return sb.ToString();
    }

    private string BuildBookReply()
    {
        var p = _options.PublicProfile;
        return
            $"I’d be delighted to help you book. Open Accommodations ({p.BookPath}), choose your dates and room, then follow the gentle steps on screen. "
            + $"If your arrival is soon, the site may confirm a booking right away. Need a human touch? Call us at {p.PhonePrimary} — we’re here for you.";
    }

    private string BuildBookWithDatesReply()
    {
        var p = _options.PublicProfile;
        return
            $"Thank you for sharing your plans — I can guide you, though I can’t finish the booking inside this chat. "
            + $"Please open Accommodations ({p.BookPath}), enter your check-in and check-out dates, pick a room (Twin, Queen, and more), and continue. "
            + $"If anything feels unclear, call {p.PhonePrimary} and we’ll walk you through it warmly.";
    }

    private async Task<string> BuildInclusionsReplyAsync(CancellationToken cancellationToken)
    {
        var types = await GetAvailableTypesWithInclusionsAsync(cancellationToken);
        if (types.Count == 0)
        {
            return
                "I don’t have inclusion details online just now. Breakfast and amenities depend on the room type — "
                + "please peek at Accommodations or ask our front desk; they’ll make sure you’re comfortable.";
        }

        var sb = new StringBuilder("Here’s what’s listed with each room type:");
        sb.AppendLine();
        foreach (var t in types)
        {
            sb.Append("- ").Append(t.Name).Append(": ");
            if (t.Inclusions.Count == 0)
                sb.AppendLine("no inclusions listed online yet (ask the desk about breakfast — we’re happy to clarify).");
            else
                sb.AppendLine(string.Join(", ", t.Inclusions));
        }

        sb.Append("If breakfast isn’t listed above, it usually isn’t in the base rate — but do ask us if you’d like to add something special.");
        return sb.ToString();
    }

    private string BuildPaymentReply()
    {
        var p = _options.PublicProfile;
        return
            "We don’t take payment online — everything is settled at our front desk. "
            + "You can pay by cash, or by QR at the counter using GCash or PayMaya (InstaPay). "
            + "Those are our only payment methods. "
            + $"If you need help when you arrive, call us at {p.PhonePrimary} or {p.PhoneSecondary} — we’ll take care of you.";
    }

    private string BuildLocationReply()
    {
        var p = _options.PublicProfile;
        return
            $"We’re glad you’re finding your way to us. {p.HotelName} is at {p.Address}. "
            + $"For directions or arrival tips, call {p.PhonePrimary} or {p.PhoneSecondary} — we’ll help you arrive at ease.";
    }

    private string BuildStayTimesReply()
    {
        var p = _options.PublicProfile;
        return
            $"Standard check-in is {p.CheckIn}, with an early option around {p.EarlyCheckIn} when available. "
            + $"Check-out is {p.CheckOut}. Early check-in or late checkout may add a small fee — you’ll see the options when you book, and we’re happy to explain.";
    }

    private string BuildContactReply()
    {
        var p = _options.PublicProfile;
        return
            $"Our front desk would love to hear from you: {p.PhonePrimary} or {p.PhoneSecondary}. "
            + $"We’re at {p.HotelName}, {p.Address} — come visit when you can.";
    }

    private string BuildWifiReply() =>
        "Yes — guest Wi‑Fi is part of a comfortable stay. You’ll get the network name and password at check-in or from our front desk. "
        + "I don’t share staff passwords here, but our team will connect you gladly.";

    private async Task<string> BuildReviewsReplyAsync(CancellationToken cancellationToken)
    {
        try
        {
            var page = await _reviews.GetPublicAsync(6, cancellationToken);
            var count = page.ReviewCount;
            if (count == 0 || page.Items.Count == 0)
                return "Guest stories appear on our home page when they’re published. I won’t invent ratings — you’re always welcome to read what’s shared there.";

            var avg = page.AverageOverall;
            return
                $"We’re grateful for {count} public guest review(s)"
                + (avg > 0 ? $" (about {avg:0.0}/5 on average)" : string.Empty)
                + ". You’ll find them under Reviews on the home page — thank you for caring about other guests’ experiences.";
        }
        catch
        {
            return "Guest reviews appear on our home page when published — you’re welcome to browse them anytime.";
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
