using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace TestingDemo.Services.Chat;

public sealed class ChatMatchPrepareResult
{
    public required string OriginalText { get; init; }
    public required string MatchText { get; init; }
    public required string ReplyLanguage { get; init; }
    public required string LanguageHint { get; init; }
}

public interface IChatRuleMatchTranslator
{
    Task<ChatMatchPrepareResult> PrepareForMatchingAsync(
        string text,
        string? uiLangHint,
        string? stickyReplyLanguage = null,
        CancellationToken cancellationToken = default);

    Task<string> ToGuestLanguageAsync(
        string reply,
        string replyLanguage,
        CancellationToken cancellationToken = default);

    /// <summary>Public guest-facing translate (reviews). Returns null on failure.</summary>
    Task<string?> TranslatePublicAsync(
        string text,
        string targetLanguage,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Google translate_a/gtx: English for FAQ matching + reply localization.
/// Script heuristics keep Chinese/Japanese/etc. working when translate fails.
/// </summary>
public sealed class ChatRuleMatchTranslator : IChatRuleMatchTranslator
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _cache;
    private readonly ILogger<ChatRuleMatchTranslator> _logger;

    private static readonly Regex MostlyAscii = new(
        @"^[\x00-\x7F\s\p{P}\p{S}]+$",
        RegexOptions.Compiled);

    private const int MaxChunkChars = 420;

    public ChatRuleMatchTranslator(
        IHttpClientFactory httpClientFactory,
        IMemoryCache cache,
        ILogger<ChatRuleMatchTranslator> logger)
    {
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _logger = logger;
    }

    public async Task<ChatMatchPrepareResult> PrepareForMatchingAsync(
        string text,
        string? uiLangHint,
        string? stickyReplyLanguage = null,
        CancellationToken cancellationToken = default)
    {
        var trimmed = (text ?? string.Empty).Trim();
        var uiHint = NormalizeHint(uiLangHint);
        var uiReplyLang = HintToGtx(uiHint);
        var stickyGtx = HintToGtx(NormalizeHint(stickyReplyLanguage));
        var scriptLang = DetectScriptLanguage(trimmed);
        var cebuanoHint = DetectCebuanoOrBisayaRequest(trimmed);

        if (trimmed.Length == 0)
        {
            var emptyLang = cebuanoHint ?? scriptLang ?? (IsEnglishTarget(stickyGtx) ? uiReplyLang : stickyGtx);
            return new ChatMatchPrepareResult
            {
                OriginalText = trimmed,
                MatchText = trimmed,
                ReplyLanguage = emptyLang,
                LanguageHint = GtxToHint(emptyLang)
            };
        }

        // English FAQ while guest already asked for Bisaya — keep sticky Cebuano replies.
        if (cebuanoHint is null
            && scriptLang is null
            && MostlyAscii.IsMatch(trimmed)
            && LooksLikeEnglishFaq(trimmed)
            && IsEnglishTarget(stickyGtx))
        {
            return new ChatMatchPrepareResult
            {
                OriginalText = trimmed,
                MatchText = trimmed,
                ReplyLanguage = "en",
                LanguageHint = "en"
            };
        }

        if (cebuanoHint is null
            && scriptLang is null
            && MostlyAscii.IsMatch(trimmed)
            && LooksLikeEnglishFaq(trimmed)
            && !IsEnglishTarget(stickyGtx))
        {
            return new ChatMatchPrepareResult
            {
                OriginalText = trimmed,
                MatchText = trimmed,
                ReplyLanguage = stickyGtx,
                LanguageHint = GtxToHint(stickyGtx)
            };
        }

        var cacheKey = "chat.match.prep.v4:" + stickyGtx + ":" + trimmed.ToLowerInvariant();
        if (_cache.TryGetValue(cacheKey, out ChatMatchPrepareResult? cached) && cached is not null)
            return cached;

        var sourceHint = cebuanoHint ?? scriptLang ?? "auto";
        try
        {
            var (english, detected) = await TranslateAsync(trimmed, sourceHint, "en", cancellationToken);
            if (string.IsNullOrWhiteSpace(english) && sourceHint != "auto")
                (english, detected) = await TranslateAsync(trimmed, "auto", "en", cancellationToken);

            var matchText = string.IsNullOrWhiteSpace(english) ? trimmed : english.Trim();
            // Local Cebuano book phrasing often mistranslates — keep book intent for rules.
            if (cebuanoHint == "ceb" && LooksLikeCebuanoBookAsk(trimmed) && !LooksLikeEnglishBookAsk(matchText))
                matchText = "how do I book online reservation";

            var replyLang = ResolveReplyLanguage(detected, scriptLang, cebuanoHint, stickyGtx, uiReplyLang);
            var result = new ChatMatchPrepareResult
            {
                OriginalText = trimmed,
                MatchText = matchText,
                ReplyLanguage = replyLang,
                LanguageHint = GtxToHint(replyLang)
            };
            _cache.Set(cacheKey, result, TimeSpan.FromMinutes(30));
            return result;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogDebug(ex, "Rule-match translate failed; using original + script language.");
            var replyLang = ResolveReplyLanguage(null, scriptLang, cebuanoHint, stickyGtx, uiReplyLang);
            var matchText = trimmed;
            if (cebuanoHint == "ceb" && LooksLikeCebuanoBookAsk(trimmed))
                matchText = "how do I book online reservation";
            return new ChatMatchPrepareResult
            {
                OriginalText = trimmed,
                MatchText = matchText,
                ReplyLanguage = replyLang,
                LanguageHint = GtxToHint(replyLang)
            };
        }
    }

    public async Task<string> ToGuestLanguageAsync(
        string reply,
        string replyLanguage,
        CancellationToken cancellationToken = default)
    {
        var text = (reply ?? string.Empty).Trim();
        var tl = string.IsNullOrWhiteSpace(replyLanguage) ? "en" : replyLanguage.Trim();
        if (text.Length == 0 || IsEnglishTarget(tl))
            return text;

        var cacheKey = "chat.reply.v4." + tl + ":" + text;
        if (_cache.TryGetValue(cacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
            return cached;

        try
        {
            var translated = await TranslateChunksAsync(text, "en", tl, cancellationToken);
            if (!IsSuccessfulLocalization(translated, text, tl))
            {
                _logger.LogInformation("GTX reply localize weak for {Lang}; trying MyMemory.", tl);
                translated = await TranslateViaMyMemoryAsync(text, "en", tl, cancellationToken);
            }

            if (!IsSuccessfulLocalization(translated, text, tl))
            {
                _logger.LogWarning("Reply localize to {Lang} failed; English reply kept.", tl);
                return text;
            }

            translated = translated!.Trim();
            _cache.Set(cacheKey, translated, TimeSpan.FromMinutes(30));
            return translated;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogWarning(ex, "Reply translate to {Lang} failed; using English reply.", tl);
            return text;
        }
    }

    public async Task<string?> TranslatePublicAsync(
        string text,
        string targetLanguage,
        CancellationToken cancellationToken = default)
    {
        var trimmed = (text ?? string.Empty).Trim();
        if (trimmed.Length == 0)
            return null;

        if (trimmed.Length > 6000)
            trimmed = trimmed[..6000];

        var tl = HintToGtx(NormalizeHint(targetLanguage));
        if (string.IsNullOrWhiteSpace(tl))
            tl = "en";

        var cacheKey = "chat.public.tr.v1." + tl + ":" + trimmed;
        if (_cache.TryGetValue(cacheKey, out string? cached) && !string.IsNullOrWhiteSpace(cached))
            return cached;

        try
        {
            var translated = await TranslateChunksAsync(trimmed, "auto", tl, cancellationToken);
            if (string.IsNullOrWhiteSpace(translated)
                || string.Equals(translated.Trim(), trimmed, StringComparison.OrdinalIgnoreCase))
            {
                translated = await TranslateViaMyMemoryAsync(trimmed, "auto", tl, cancellationToken);
            }

            if (string.IsNullOrWhiteSpace(translated))
                return null;

            var result = translated.Trim();
            _cache.Set(cacheKey, result, TimeSpan.FromHours(6));
            return result;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            _logger.LogDebug(ex, "Public translate to {Lang} failed.", tl);
            return null;
        }
    }

    private async Task<string?> TranslateViaMyMemoryAsync(
        string text,
        string source,
        string target,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("chat-translate");
        var langpair = $"{MapMyMemoryLang(source)}|{MapMyMemoryLang(target)}";
        var sb = new StringBuilder();
        foreach (var chunk in SplitChunks(text))
        {
            var url =
                "https://api.mymemory.translated.net/get?q="
                + Uri.EscapeDataString(chunk)
                + "&langpair=" + Uri.EscapeDataString(langpair);

            using var response = await client.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return null;

            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("responseData", out var data)
                || !data.TryGetProperty("translatedText", out var translatedEl)
                || translatedEl.ValueKind != JsonValueKind.String)
                return null;

            var part = translatedEl.GetString();
            if (string.IsNullOrWhiteSpace(part))
                return null;
            sb.Append(part);
        }

        return sb.Length == 0 ? null : sb.ToString();
    }

    private static string MapMyMemoryLang(string gtx) =>
        gtx switch
        {
            "auto" => "Autodetect",
            "zh-CN" or "zh" => "zh-CN",
            "zh-TW" => "zh-TW",
            "fil" or "tl" => "tl",
            "ceb" or "bisaya" => "ceb",
            _ => gtx
        };

    private static bool IsSuccessfulLocalization(string? translated, string original, string targetLang)
    {
        if (string.IsNullOrWhiteSpace(translated))
            return false;
        if (string.Equals(translated.Trim(), original.Trim(), StringComparison.OrdinalIgnoreCase))
            return false;

        return targetLang switch
        {
            "ko" => translated.Any(c => c is >= '\uAC00' and <= '\uD7A3'),
            "ja" => translated.Any(c =>
                c is (>= '\u3040' and <= '\u30FF') or (>= '\u4E00' and <= '\u9FFF')),
            "zh-CN" or "zh-TW" or "zh" => translated.Any(c => c is >= '\u4E00' and <= '\u9FFF'),
            "ru" => translated.Any(c => c is >= '\u0400' and <= '\u04FF'),
            _ => true
        };
    }

    private async Task<string?> TranslateChunksAsync(
        string text,
        string source,
        string target,
        CancellationToken cancellationToken)
    {
        if (text.Length <= MaxChunkChars)
        {
            var (one, _) = await TranslateAsync(text, source, target, cancellationToken);
            return one;
        }

        var sb = new StringBuilder(text.Length + 32);
        var any = false;
        foreach (var chunk in SplitChunks(text))
        {
            var (part, _) = await TranslateAsync(chunk, source, target, cancellationToken);
            if (string.IsNullOrWhiteSpace(part))
                return null;
            sb.Append(part);
            any = true;
        }

        return any ? sb.ToString() : null;
    }

    private async Task<(string? Text, string? Detected)> TranslateAsync(
        string text,
        string source,
        string target,
        CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("chat-translate");
        var url =
            "https://translate.googleapis.com/translate_a/single?client=gtx"
            + "&sl=" + Uri.EscapeDataString(source)
            + "&tl=" + Uri.EscapeDataString(target)
            + "&dt=t&q=" + Uri.EscapeDataString(text);

        using var response = await client.GetAsync(url, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            _logger.LogDebug("Translate HTTP {Status} ({Sl}->{Tl}).", (int)response.StatusCode, source, target);
            return (null, null);
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return ParseGtx(body);
    }

    private static IEnumerable<string> SplitChunks(string text)
    {
        var remaining = text;
        while (remaining.Length > 0)
        {
            if (remaining.Length <= MaxChunkChars)
            {
                yield return remaining;
                yield break;
            }

            var window = remaining[..MaxChunkChars];
            var breakAt = Math.Max(
                window.LastIndexOf('\n'),
                Math.Max(window.LastIndexOf(". "), window.LastIndexOf("。")));
            if (breakAt < MaxChunkChars / 3)
                breakAt = MaxChunkChars;
            else if (breakAt < window.Length && window[breakAt] is '.' or '。')
                breakAt += 1;
            else if (breakAt < window.Length && window[breakAt] == ' ')
                breakAt += 1;

            yield return remaining[..breakAt];
            remaining = remaining[breakAt..];
        }
    }

    private static string ResolveReplyLanguage(
        string? detected,
        string? scriptLang,
        string? cebuanoHint,
        string stickyGtx,
        string uiReplyLang)
    {
        if (!string.IsNullOrWhiteSpace(cebuanoHint))
            return cebuanoHint!;

        if (!string.IsNullOrWhiteSpace(scriptLang))
            return scriptLang!;

        var mapped = MapDetectedToGtx(detected);
        if (!string.IsNullOrWhiteSpace(mapped) && !IsEnglishTarget(mapped))
            return mapped!;

        if (!IsEnglishTarget(stickyGtx))
            return stickyGtx;

        if (!string.IsNullOrWhiteSpace(mapped))
            return mapped!;

        return IsEnglishTarget(uiReplyLang) ? "en" : uiReplyLang;
    }

    /// <summary>
    /// Cebuano/Bisaya is Latin script — detect by markers or an explicit “speak Bisaya” request.
    /// </summary>
    internal static string? DetectCebuanoOrBisayaRequest(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return null;

        var lower = text.ToLowerInvariant();
        if (lower.Contains("bisaya", StringComparison.Ordinal)
            || lower.Contains("binisaya", StringComparison.Ordinal)
            || lower.Contains("cebuano", StringComparison.Ordinal)
            || lower.Contains("sugbuanon", StringComparison.Ordinal))
            return "ceb";

        foreach (var marker in new[]
                 {
                     "unsaon", "unsa ", "nako", "akoang", "akoa", "reserba", "pareserba",
                     "pagbook", "pag-book", "kanus-a", "kanusa", "pila ka", "asa mo",
                     "naa moy", "wala koy", "salamat kaayo", "maayong", "pwede ba",
                     "pwedi ba", "kung pwede", "sa akoang", "among booking"
                 })
        {
            if (lower.Contains(marker, StringComparison.Ordinal))
                return "ceb";
        }

        return null;
    }

    private static bool LooksLikeCebuanoBookAsk(string text)
    {
        var lower = (text ?? string.Empty).ToLowerInvariant();
        return lower.Contains("reserba", StringComparison.Ordinal)
               || lower.Contains("book", StringComparison.Ordinal)
               || lower.Contains("booking", StringComparison.Ordinal)
               || lower.Contains("reserve", StringComparison.Ordinal);
    }

    private static bool LooksLikeEnglishBookAsk(string text)
    {
        var lower = (text ?? string.Empty).ToLowerInvariant();
        return lower.Contains("book", StringComparison.Ordinal)
               || lower.Contains("reserv", StringComparison.Ordinal);
    }

    internal static string? DetectScriptLanguage(string text)
    {
        if (string.IsNullOrEmpty(text))
            return null;

        var hasHangul = false;
        var hasKana = false;
        var hasHan = false;
        var hasCyrillic = false;

        foreach (var c in text)
        {
            if (c is >= '\uAC00' and <= '\uD7A3')
                hasHangul = true;
            else if (c is (>= '\u3040' and <= '\u30FF') or (>= '\u31F0' and <= '\u31FF'))
                hasKana = true;
            else if (c is >= '\u4E00' and <= '\u9FFF')
                hasHan = true;
            else if (c is >= '\u0400' and <= '\u04FF')
                hasCyrillic = true;
        }

        if (hasHangul) return "ko";
        if (hasKana) return "ja";
        if (hasHan) return "zh-CN";
        if (hasCyrillic) return "ru";
        return null;
    }

    private static string? MapDetectedToGtx(string? detected)
    {
        if (string.IsNullOrWhiteSpace(detected))
            return null;

        var code = detected.Trim().ToLowerInvariant();
        return code switch
        {
            "en" or "eng" => "en",
            "ja" or "jp" => "ja",
            "ko" or "kr" => "ko",
            "zh-cn" or "zh" or "zh-hans" => "zh-CN",
            "zh-tw" or "zh-hant" => "zh-TW",
            "ru" => "ru",
            "tl" or "fil" or "tgl" => "tl",
            "ceb" or "bisaya" or "cebuano" => "ceb",
            _ => code.Length is >= 2 and <= 8 ? code : null
        };
    }

    private static string NormalizeHint(string? lang)
    {
        if (string.IsNullOrWhiteSpace(lang))
            return "en";
        var code = lang.Trim();
        if (code.Equals("zh", StringComparison.OrdinalIgnoreCase))
            return "zh-Hans";
        if (code.Equals("tl", StringComparison.OrdinalIgnoreCase))
            return "fil";
        if (code.Equals("bisaya", StringComparison.OrdinalIgnoreCase)
            || code.Equals("cebuano", StringComparison.OrdinalIgnoreCase)
            || code.Equals("ceb", StringComparison.OrdinalIgnoreCase))
            return "ceb";
        return code;
    }

    private static string HintToGtx(string hint) =>
        hint switch
        {
            "zh-Hans" => "zh-CN",
            "fil" or "tl" => "tl",
            "ceb" or "bisaya" or "cebuano" => "ceb",
            "ja" => "ja",
            "ko" => "ko",
            "ru" => "ru",
            _ => "en"
        };

    private static string GtxToHint(string gtx) =>
        gtx switch
        {
            "zh-CN" or "zh-TW" or "zh" => "zh-Hans",
            "tl" or "fil" => "fil",
            "ceb" or "bisaya" or "cebuano" => "ceb",
            "ja" => "ja",
            "ko" => "ko",
            "ru" => "ru",
            _ => "en"
        };

    private static bool IsEnglishTarget(string lang) =>
        lang.Equals("en", StringComparison.OrdinalIgnoreCase)
        || lang.Equals("eng", StringComparison.OrdinalIgnoreCase);

    private static bool LooksLikeEnglishFaq(string text)
    {
        var lower = text.ToLowerInvariant();
        return lower.Contains("room")
               || lower.Contains("price")
               || lower.Contains("rate")
               || lower.Contains("book")
               || lower.Contains("check")
               || lower.Contains("offer")
               || lower.Contains("review")
               || lower.Contains("location")
               || lower.Contains("address")
               || lower.Contains("payment")
               || lower.Contains("wifi")
               || lower.Contains("wi-fi")
               || lower.Contains("phone")
               || lower.Contains("hotel");
    }

    private static (string? Text, string? Detected) ParseGtx(string body)
    {
        using var doc = JsonDocument.Parse(body);
        if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0)
            return (null, null);

        var first = doc.RootElement[0];
        string? translated = null;
        if (first.ValueKind == JsonValueKind.Array)
        {
            var sb = new StringBuilder();
            foreach (var part in first.EnumerateArray())
            {
                if (part.ValueKind != JsonValueKind.Array || part.GetArrayLength() == 0)
                    continue;
                if (part[0].ValueKind == JsonValueKind.String)
                    sb.Append(part[0].GetString());
            }

            if (sb.Length > 0)
                translated = sb.ToString();
        }

        string? detected = null;
        if (doc.RootElement.GetArrayLength() > 2 && doc.RootElement[2].ValueKind == JsonValueKind.String)
            detected = doc.RootElement[2].GetString();

        return (translated, detected);
    }
}
