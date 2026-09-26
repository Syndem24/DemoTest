using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using TestingDemo.Options;

namespace TestingDemo.Services.Chat;

public interface IChatOrchestrator
{
    Task<ChatWelcomeResponse> WelcomeAsync(CancellationToken cancellationToken = default);
    Task<ChatReplyResult> ReplyAsync(
        HttpContext http,
        string message,
        string? lang,
        IEnumerable<ChatTurn>? clientHistory,
        CancellationToken cancellationToken = default);
}

public sealed class ChatOrchestrator : IChatOrchestrator
{
    private readonly IEnumerable<IChatLlmProvider> _providers;
    private readonly IChatGuardrails _guardrails;
    private readonly IChatPublicContextBuilder _context;
    private readonly IChatConversationStore _conversation;
    private readonly IChatRuleEngine _rules;
    private readonly IChatRuleMatchTranslator _translator;
    private readonly ChatProviderUsageTracker _usage;
    private readonly ChatbotOptions _options;
    private readonly ILogger<ChatOrchestrator> _logger;

    private static readonly string SystemInstruction =
        "You are a warm, attentive front-desk receptionist for Mori International Hotel (guest website chat). "
        + "Speak like a caring human host: friendly, clear, and reassuring — never stiff, robotic, or bullet-heavy unless listing rooms or rates. "
        + "Read the guest’s full message carefully. If they ask several things at once, answer each part in a natural flowing reply. "
        + "Use only public hotel facts from HOTEL_CONTEXT. Do not invent prices, room numbers, confirmation codes, bookings, payments, or policies. "
        + "You cannot look up personal reservations; gently guide them to sign in for Booking history or call the front desk. "
        + "When the guest greets you or opens with small talk, greet them back naturally in one short line — vary your wording, never recite the same welcome — then gently ask how you can help. "
        + "When a message is garbled, badly constructed, or unclear, say honestly that you did not quite catch it, name the topic they may mean if any (rooms, rates, check-in…), and invite them to clarify — use phrasing like \"if you can clarify, I'm glad to help you\" — never pretend you understood. "
        + "Prefer short warm paragraphs (2–5 sentences). End with a helpful next step when useful. "
        + "Always reply in the guest’s language (see language hint).";

    public ChatOrchestrator(
        IEnumerable<IChatLlmProvider> providers,
        IChatGuardrails guardrails,
        IChatPublicContextBuilder context,
        IChatConversationStore conversation,
        IChatRuleEngine rules,
        IChatRuleMatchTranslator translator,
        ChatProviderUsageTracker usage,
        IOptions<ChatbotOptions> options,
        ILogger<ChatOrchestrator> logger)
    {
        _providers = providers;
        _guardrails = guardrails;
        _context = context;
        _conversation = conversation;
        _rules = rules;
        _translator = translator;
        _usage = usage;
        _options = options.Value;
        _logger = logger;
    }

    public Task<ChatWelcomeResponse> WelcomeAsync(CancellationToken cancellationToken = default)
    {
        var profile = _options.PublicProfile;
        var name = string.IsNullOrWhiteSpace(_options.AssistantName) ? "Mori Assistant" : _options.AssistantName.Trim();
        var reply =
            $"Welcome to {profile.HotelName} — I’m {name}. I’m happy to help with rooms, rates, offers, check-in times, how to book, or finding us in Cebu. "
            + "For your personal reservation details, please use Booking history after you sign in, or call our front desk anytime.";

        return Task.FromResult(new ChatWelcomeResponse
        {
            Reply = reply,
            AssistantName = name,
            ChatEnabled = _options.Enabled,
            DeskPhone = profile.PhonePrimary,
            DeskPhoneAlt = profile.PhoneSecondary,
            Suggestions = new[]
            {
                "What rooms are available?",
                "What time is check-in?",
                "How do I leave a review?",
                "How do I book online?"
            }
        });
    }

    public async Task<ChatReplyResult> ReplyAsync(
        HttpContext http,
        string message,
        string? lang,
        IEnumerable<ChatTurn>? clientHistory,
        CancellationToken cancellationToken = default)
    {
        var maxChars = Math.Clamp(_options.MaxInputChars, 50, 1000);
        var trimmed = (message ?? string.Empty).Trim();
        if (trimmed.Length > maxChars)
            trimmed = trimmed[..maxChars];

        var maxTurns = Math.Clamp(_options.HistoryTurns, 2, 16);
        var fromClient = _guardrails.SanitizeHistory(clientHistory, maxTurns, maxChars);
        var fromSession = _guardrails.SanitizeHistory(_conversation.Get(http), maxTurns, maxChars);
        var history = fromClient.Count > 0 ? fromClient : fromSession;

        // Detect language + English match text (sticky Bisaya/Cebuano when guest asked for it).
        var stickyLang = _conversation.GetReplyLanguage(http);
        var prepared = await _translator.PrepareForMatchingAsync(
            trimmed,
            lang,
            stickyLang,
            cancellationToken);
        PersistReplyLanguage(http, prepared.ReplyLanguage);

        if (_guardrails.TryRefuse(trimmed, out var refuse)
            || _guardrails.TryRefuse(prepared.MatchText, out refuse))
        {
            var refuseReply = await LocalizeReplyAsync(refuse, prepared.ReplyLanguage, cancellationToken);
            return Finish(http, history, trimmed, refuseReply, "refused", usedAiFallback: false);
        }

        if (!_options.Enabled)
        {
            var disabled = await LocalizeReplyAsync(_rules.BuildUnknownTopicReply(), prepared.ReplyLanguage, cancellationToken);
            return Finish(http, history, trimmed, disabled, "unknown", usedAiFallback: false);
        }

        if (_rules.TryLanguageSwitchReply(trimmed, prepared.MatchText, prepared.ReplyLanguage, out var switchReply))
            return Finish(http, history, trimmed, switchReply, "lang-switch", usedAiFallback: false);

        var complex = LooksComplexGuestMessage(prepared.MatchText, trimmed);
        // Complex multi-part questions: Gemini first, then Groq — before FAQ rules (book rule is too narrow).
        if (complex && _options.UseGeminiFallback)
        {
            var aiFirst = await TryAiReplyAsync(
                http,
                history,
                trimmed,
                prepared.LanguageHint,
                preferDeepAnswer: true,
                cancellationToken);
            if (aiFirst is not null)
                return aiFirst;

            var complexMiss = await LocalizeReplyAsync(
                _rules.BuildComplexAiMissReply(),
                prepared.ReplyLanguage,
                cancellationToken);
            return Finish(http, history, trimmed, complexMiss, "complex-miss", usedAiFallback: false);
        }

        // Greetings and garbled-but-topical messages: let the AI evaluate the guest first
        // (varied warm greeting / honest clarification), with canned replies as fallback.
        var awkward = _rules.LooksAwkwardlyPhrased(prepared.MatchText, out var ambiguousTopic);
        var isOpener = !awkward
            && _rules.IsConversationalOpener(prepared.MatchText, prepared.OriginalText);

        if ((isOpener || awkward) && _options.UseGeminiFallback)
        {
            var entryAi = await TryAiReplyAsync(
                http,
                history,
                trimmed,
                prepared.LanguageHint,
                preferDeepAnswer: false,
                cancellationToken);
            if (entryAi is not null)
                return entryAi;
        }

        if (awkward)
        {
            var clarify = await LocalizeReplyAsync(
                _rules.BuildAmbiguousTopicReply(ambiguousTopic),
                prepared.ReplyLanguage,
                cancellationToken);
            return Finish(http, history, trimmed, clarify, "ambiguous", usedAiFallback: false);
        }

        var ruleReply = await _rules.TryRuleBasedReplyAsync(
            prepared.MatchText,
            prepared.OriginalText,
            cancellationToken);
        if (!string.IsNullOrWhiteSpace(ruleReply))
        {
            var localizedRule = await LocalizeReplyAsync(ruleReply, prepared.ReplyLanguage, cancellationToken);
            return Finish(http, history, trimmed, localizedRule, "rule", usedAiFallback: false);
        }

        if (_options.UseGeminiFallback)
        {
            var aiFallback = await TryAiReplyAsync(
                http,
                history,
                trimmed,
                prepared.LanguageHint,
                preferDeepAnswer: false,
                cancellationToken);
            if (aiFallback is not null)
                return aiFallback;
        }

        var unknown = await LocalizeReplyAsync(_rules.BuildUnknownTopicReply(), prepared.ReplyLanguage, cancellationToken);
        return Finish(http, history, trimmed, unknown, "unknown", usedAiFallback: false);
    }

    /// <summary>Try Gemini, then Groq. Records per-provider consumption on success.</summary>
    private async Task<ChatReplyResult?> TryAiReplyAsync(
        HttpContext http,
        IReadOnlyList<ChatTurn> history,
        string userMessage,
        string? languageHint,
        bool preferDeepAnswer,
        CancellationToken cancellationToken)
    {
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        if (!_usage.HasDailyQuotaRemaining(ip, _options.MaxLlmPerIpPerDay))
            return null;

        var hotelContext = await _context.BuildAsync(cancellationToken);
        var maxTokens = preferDeepAnswer
            ? Math.Clamp(Math.Max(_options.MaxOutputTokens, 1200), 128, 2048)
            : Math.Clamp(_options.MaxOutputTokens, 128, 2048);
        var manilaNow = PhilippinesTime.NowManila();
        var request = new ChatCompletionRequest
        {
            // Include live Manila time so time-of-day greetings match the guest's actual
            // afternoon/evening instead of the model guessing "good morning".
            SystemInstruction = SystemInstruction
                + $" Local time at the hotel right now (Asia/Manila): {manilaNow:dddd, MMM d, h:mm tt}. "
                + "If you greet with a time of day, match it — \"good morning\" only before 12:00, \"good afternoon\" from 12:00 to 17:59, \"good evening\" from 18:00 onward.",
            HotelContext = hotelContext,
            History = history,
            UserMessage = preferDeepAnswer
                ? "Please read my full message carefully and answer every part warmly, using only HOTEL_CONTEXT facts:\n\n"
                  + userMessage
                : userMessage,
            LanguageHint = languageHint,
            MaxOutputTokens = maxTokens,
            Temperature = Math.Clamp(_options.Temperature, 0, 1)
        };

        foreach (var kind in new[] { ChatProviderKind.Gemini, ChatProviderKind.Groq })
        {
            var provider = _providers.FirstOrDefault(p => p.Kind == kind);
            if (provider is null
                || !await provider.IsConfiguredAsync(cancellationToken)
                || _usage.IsForceFallback(kind))
                continue;

            var result = await provider.CompleteAsync(request, cancellationToken);
            if (result.Truncated)
            {
                // Thinking + answer didn't fit the budget — retry once with real headroom.
                result = await provider.CompleteAsync(
                    new ChatCompletionRequest
                    {
                        SystemInstruction = request.SystemInstruction,
                        HotelContext = request.HotelContext,
                        History = request.History,
                        UserMessage = request.UserMessage,
                        LanguageHint = request.LanguageHint,
                        MaxOutputTokens = Math.Clamp(request.MaxOutputTokens * 2, 512, 4096),
                        Temperature = request.Temperature
                    },
                    cancellationToken);
            }

            if (result.QuotaExhausted)
            {
                _usage.RecordFailure(kind, "quota");
                _usage.MarkForceFallback(
                    kind,
                    "quota",
                    TimeSpan.FromMinutes(Math.Clamp(_options.ProviderCooldownMinutes, 5, 240)));
                _logger.LogInformation("{Provider} quota exhausted; trying next provider.", kind);
                continue;
            }

            // A still-truncated reply keeps its text — a slightly short answer is better
            // than dropping to the canned fallback.
            if (string.IsNullOrWhiteSpace(result.Text) || (!result.Succeeded && !result.Truncated))
            {
                _usage.RecordFailure(kind, result.ErrorKind ?? "empty");
                _logger.LogInformation(
                    "{Provider} reply miss ({Kind}).",
                    kind,
                    result.ErrorKind ?? "empty");
                continue;
            }

            var filtered = _guardrails.FilterOutput(result.Text, () => string.Empty);
            if (string.IsNullOrWhiteSpace(filtered))
                continue;

            _usage.TryConsumeDailyQuota(ip, _options.MaxLlmPerIpPerDay);
            _usage.RecordSuccessfulApiCall(kind, ip);
            var outcome = kind == ChatProviderKind.Groq ? "groq" : "gemini";
            return Finish(http, history, userMessage, filtered, outcome, usedAiFallback: true);
        }

        return null;
    }

    /// <summary>
    /// Multi-intent / long / compound questions should go to the LLM so every part gets a careful answer.
    /// </summary>
    private static bool LooksComplexGuestMessage(string matchText, string original)
    {
        var text = string.IsNullOrWhiteSpace(matchText) ? original : matchText;
        text = (text ?? string.Empty).Trim();
        if (text.Length >= 140)
            return true;

        var questionMarks = text.Count(c => c is '?' or '？' or '¿');
        if (questionMarks >= 2)
            return true;

        var lower = text.ToLowerInvariant();
        var connectors = 0;
        foreach (var marker in new[]
                 {
                     " and ", " also ", " plus ", " as well", " but ", " then ",
                     " another ", " second", " first ", " both ",
                     "还有", "另外", "그리고", "また", "그리고요"
                 })
        {
            if (lower.Contains(marker, StringComparison.Ordinal))
                connectors++;
        }

        if (connectors >= 1 && text.Length >= 60)
            return true;

        var topics = 0;
        foreach (var topic in new[]
                 {
                     "room", "book", "price", "rate", "check-in", "check in", "check-out",
                     "offer", "location", "wifi", "review", "pay", "breakfast", "park", "airport"
                 })
        {
            if (lower.Contains(topic, StringComparison.Ordinal))
                topics++;
        }

        return topics >= 2 && text.Length >= 45;
    }

    private Task<string> LocalizeReplyAsync(
        string englishReply,
        string replyLanguage,
        CancellationToken cancellationToken)
    {
        if (IsCebuano(replyLanguage))
        {
            var native = _rules.TryNativeCebuanoReply(englishReply);
            if (!string.IsNullOrWhiteSpace(native))
                return Task.FromResult(native);
        }

        return _translator.ToGuestLanguageAsync(englishReply, replyLanguage, cancellationToken);
    }

    private void PersistReplyLanguage(HttpContext http, string replyLanguage)
    {
        if (string.IsNullOrWhiteSpace(replyLanguage)
            || replyLanguage.Equals("en", StringComparison.OrdinalIgnoreCase))
            return;
        _conversation.SetReplyLanguage(http, replyLanguage);
    }

    private static bool IsCebuano(string? lang) =>
        lang is not null
        && (lang.Equals("ceb", StringComparison.OrdinalIgnoreCase)
            || lang.Equals("bisaya", StringComparison.OrdinalIgnoreCase)
            || lang.Equals("cebuano", StringComparison.OrdinalIgnoreCase));

    private ChatReplyResult Finish(
        HttpContext http,
        IReadOnlyList<ChatTurn> history,
        string userMessage,
        string reply,
        string outcome,
        bool usedAiFallback)
    {
        var next = history.ToList();
        next.Add(new ChatTurn { Role = "user", Content = userMessage });
        next.Add(new ChatTurn { Role = "assistant", Content = reply });
        _conversation.Save(http, next);
        _logger.LogInformation(
            "Chat outcome={Outcome} usedAiFallback={UsedAiFallback}",
            outcome,
            usedAiFallback);
        return new ChatReplyResult
        {
            Reply = reply,
            Outcome = outcome,
            UsedAiFallback = usedAiFallback
        };
    }
}
