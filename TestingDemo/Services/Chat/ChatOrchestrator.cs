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
        "You are Mori Assistant for Mori International Hotel (guest site). Answer only with public hotel facts from HOTEL_CONTEXT. "
        + "Do not look up bookings, payments, or guest accounts. Do not invent confirmation codes, room numbers, or prices not in context. "
        + "If unsure, tell the guest to call the front desk. Keep answers short and helpful. "
        + "Always reply in the guest's language (see language hint).";

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
            $"Hello — I’m {name} for {profile.HotelName}. Ask about rooms, rates, offers, check-in, location, or how to book. I cannot look up personal reservations.";

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
                "Any guest offers right now?",
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

        // Detect language + English match text first so refusals/rules localize correctly.
        var prepared = await _translator.PrepareForMatchingAsync(trimmed, lang, cancellationToken);

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
            var gemini = _providers.FirstOrDefault(p => p.Kind == ChatProviderKind.Gemini);
            if (gemini is not null
                && await gemini.IsConfiguredAsync(cancellationToken)
                && !_usage.IsForceFallback(ChatProviderKind.Gemini))
            {
                var ip = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                if (_usage.HasDailyQuotaRemaining(ip, _options.MaxLlmPerIpPerDay))
                {
                    var hotelContext = await _context.BuildAsync(cancellationToken);
                    var request = new ChatCompletionRequest
                    {
                        SystemInstruction = SystemInstruction,
                        HotelContext = hotelContext,
                        History = Array.Empty<ChatTurn>(),
                        UserMessage = trimmed,
                        LanguageHint = prepared.LanguageHint,
                        MaxOutputTokens = Math.Clamp(_options.MaxOutputTokens, 64, 800),
                        Temperature = Math.Clamp(_options.Temperature, 0, 1)
                    };

                    var result = await gemini.CompleteAsync(request, cancellationToken);
                    if (result.QuotaExhausted)
                    {
                        _usage.MarkForceFallback(
                            ChatProviderKind.Gemini,
                            "quota",
                            TimeSpan.FromMinutes(Math.Clamp(_options.ProviderCooldownMinutes, 5, 240)));
                    }
                    else if (result.Succeeded && !string.IsNullOrWhiteSpace(result.Text))
                    {
                        var filtered = _guardrails.FilterOutput(result.Text, () => string.Empty);
                        if (!string.IsNullOrWhiteSpace(filtered))
                        {
                            _usage.TryConsumeDailyQuota(ip, _options.MaxLlmPerIpPerDay);
                            return Finish(http, history, trimmed, filtered, "gemini", usedAiFallback: true);
                        }
                    }
                    else
                    {
                        _logger.LogInformation(
                            "Gemini fallback miss ({Kind}); unknown-topic reply.",
                            result.ErrorKind ?? "empty");
                    }
                }
            }
        }

        var unknown = await LocalizeReplyAsync(_rules.BuildUnknownTopicReply(), prepared.ReplyLanguage, cancellationToken);
        return Finish(http, history, trimmed, unknown, "unknown", usedAiFallback: false);
    }

    private Task<string> LocalizeReplyAsync(
        string englishReply,
        string replyLanguage,
        CancellationToken cancellationToken) =>
        _translator.ToGuestLanguageAsync(englishReply, replyLanguage, cancellationToken);

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
