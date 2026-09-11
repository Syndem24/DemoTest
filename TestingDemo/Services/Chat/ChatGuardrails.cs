using System.Text;
using System.Text.RegularExpressions;

namespace TestingDemo.Services.Chat;

public interface IChatGuardrails
{
    bool TryRefuse(string message, out string reply);
    string? FilterOutput(string reply, Func<string> deskFallback);
    IReadOnlyList<ChatTurn> SanitizeHistory(IEnumerable<ChatTurn>? history, int maxTurns, int maxCharsPerTurn);
    string NormalizeLanguage(string? lang);
}

public sealed class ChatGuardrails : IChatGuardrails
{
    private static readonly HashSet<string> AllowedLangs = new(StringComparer.OrdinalIgnoreCase)
    {
        "en", "ja", "ko", "zh-Hans", "zh", "ru", "fil", "tl", "ceb", "bisaya"
    };

    private static readonly Regex BookingLookup = new(
        @"\b(MOR[- ]?\d{3,}|\bmy\s+(booking|reservation)\b|\b(look\s*up|check|find|status of|see)\s+(my\s+)?(booking|reservation)\b|\bcancel\s+(my\s+)?(booking|reservation)\b|\b(payment|receipt|invoice)\s+(status|copy|number)\b|\b(cvv|cvc|card\s*number|credit\s*card|debit\s*card)\b|\b(connection\s*string|api\s*key|smtp\s*password|staff\s*login|admin\s*password)\b|\beveryone'?s\s+reservation|\ball\s+guests?\b|booking\s+status|reservation\s+status)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex BookingLookupMultilingual = new(
        @"我的(预订|訂單|订单)|预订状态|訂單狀態|订单状态|取消(预订|訂單|订单)|查(询|一下)?(我的)?(预订|訂單|订单)|予約(確認|状況|キャンセル)|予約を(確認|キャンセル)|내\s*예약|예약\s*(조회|확인|취소)|бронир",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex FakeConfirm = new(
        @"\b(your\s+(booking|reservation)\s+is\s+(confirmed|complete|booked)|confirmation\s+code\s*:?\s*MOR|MOR[- ]?\d{4,})\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex RoomNumberLeak = new(
        @"\broom\s*(number|#|no\.?)\s*:?\s*\d{2,}\b",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public bool TryRefuse(string message, out string reply)
    {
        reply = string.Empty;
        if (string.IsNullOrWhiteSpace(message))
        {
            reply = "Whenever you’re ready, type a short question about the hotel — I’m happy to help.";
            return true;
        }

        var normalized = message.Normalize(NormalizationForm.FormKC).Trim();
        if (BookingLookup.IsMatch(normalized) || BookingLookupMultilingual.IsMatch(normalized))
        {
            reply =
                "I care about getting your stay details right, so I can’t look up, change, or cancel personal bookings or payments in chat. "
                + "Please call our front desk, or sign in and open Booking history — we’ll take good care of you there.";
            return true;
        }

        return false;
    }

    public string? FilterOutput(string reply, Func<string> deskFallback)
    {
        if (string.IsNullOrWhiteSpace(reply))
            return deskFallback();

        if (FakeConfirm.IsMatch(reply) || RoomNumberLeak.IsMatch(reply) || BookingLookup.IsMatch(reply))
            return deskFallback();

        return reply.Trim();
    }

    public IReadOnlyList<ChatTurn> SanitizeHistory(
        IEnumerable<ChatTurn>? history,
        int maxTurns,
        int maxCharsPerTurn)
    {
        if (history is null)
            return Array.Empty<ChatTurn>();

        var turns = new List<ChatTurn>(maxTurns);
        foreach (var raw in history)
        {
            if (raw is null)
                continue;
            var role = (raw.Role ?? string.Empty).Trim().ToLowerInvariant();
            if (role is not ("user" or "assistant"))
                continue;
            var content = (raw.Content ?? string.Empty).Trim();
            if (content.Length == 0)
                continue;
            if (content.Length > maxCharsPerTurn)
                content = content[..maxCharsPerTurn];
            turns.Add(new ChatTurn { Role = role, Content = content });
        }

        if (turns.Count > maxTurns)
            turns = turns.Skip(turns.Count - maxTurns).ToList();
        return turns;
    }

    public string NormalizeLanguage(string? lang)
    {
        if (string.IsNullOrWhiteSpace(lang))
            return "en";
        var code = lang.Trim();
        if (AllowedLangs.Contains(code))
        {
            if (code.Equals("zh", StringComparison.OrdinalIgnoreCase))
                return "zh-Hans";
            if (code.Equals("tl", StringComparison.OrdinalIgnoreCase)
                || code.Equals("fil", StringComparison.OrdinalIgnoreCase))
                return "fil";
            if (code.Equals("bisaya", StringComparison.OrdinalIgnoreCase)
                || code.Equals("cebuano", StringComparison.OrdinalIgnoreCase)
                || code.Equals("ceb", StringComparison.OrdinalIgnoreCase))
                return "ceb";
            return code;
        }
        return "en";
    }
}
