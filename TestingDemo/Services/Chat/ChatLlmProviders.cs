using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using TestingDemo.Models;
using TestingDemo.Options;

namespace TestingDemo.Services.Chat;

public interface IChatLlmProvider
{
    ChatProviderKind Kind { get; }
    Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default);
    Task<ChatCompletionResult> CompleteAsync(ChatCompletionRequest request, CancellationToken cancellationToken = default);
}

public sealed class GeminiChatProvider : IChatLlmProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISecureConfigStore _vault;
    private readonly ChatbotOptions _options;
    private readonly ILogger<GeminiChatProvider> _logger;

    public GeminiChatProvider(
        IHttpClientFactory httpClientFactory,
        ISecureConfigStore vault,
        IOptions<ChatbotOptions> options,
        ILogger<GeminiChatProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _vault = vault;
        _options = options.Value;
        _logger = logger;
    }

    public ChatProviderKind Kind => ChatProviderKind.Gemini;

    public Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default) =>
        _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);

    public async Task<ChatCompletionResult> CompleteAsync(
        ChatCompletionRequest request,
        CancellationToken cancellationToken = default)
    {
        var apiKey = await _vault.GetAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new ChatCompletionResult { NotConfigured = true, ErrorKind = "not_configured" };
        }

        var model = string.IsNullOrWhiteSpace(_options.GeminiModel) ? "gemini-3.5-flash" : _options.GeminiModel.Trim();
        var url =
            $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";

        var contents = new List<object>();
        foreach (var turn in request.History)
        {
            contents.Add(new
            {
                role = turn.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase) ? "model" : "user",
                parts = new[] { new { text = turn.Content } }
            });
        }

        contents.Add(new
        {
            role = "user",
            parts = new[] { new { text = request.UserMessage } }
        });

        var systemText = BuildSystem(request);
        var payload = new
        {
            systemInstruction = new { parts = new[] { new { text = systemText } } },
            contents,
            generationConfig = new
            {
                temperature = request.Temperature,
                maxOutputTokens = request.MaxOutputTokens,
                // Gemini 3.x is a thinking model — thought tokens count against
                // maxOutputTokens, so a bare budget can starve the visible reply.
                // "low" keeps guest chat fast while still reasoning a little.
                thinkingConfig = new { thinkingLevel = "low" }
            }
        };

        try
        {
            var client = _httpClientFactory.CreateClient("chat-gemini");
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url);
            httpRequest.Headers.TryAddWithoutValidation("x-goog-api-key", apiKey.Trim());
            httpRequest.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");

            using var response = await client.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.StatusCode == HttpStatusCode.TooManyRequests
                || (int)response.StatusCode == 429
                || LooksLikeQuota(body))
            {
                _logger.LogWarning("Gemini quota/rate limited for chat.");
                return new ChatCompletionResult { QuotaExhausted = true, ErrorKind = "quota" };
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Gemini chat failed with {Status}.", (int)response.StatusCode);
                return new ChatCompletionResult { ErrorKind = "http_" + (int)response.StatusCode };
            }

            using var doc = JsonDocument.Parse(body);
            var truncated = string.Equals(
                ExtractGeminiFinishReason(doc.RootElement),
                "MAX_TOKENS",
                StringComparison.OrdinalIgnoreCase);
            var text = ExtractGeminiText(doc.RootElement);
            if (string.IsNullOrWhiteSpace(text))
                return new ChatCompletionResult
                {
                    ErrorKind = truncated ? "truncated" : "empty",
                    Truncated = truncated
                };

            return new ChatCompletionResult
            {
                Succeeded = !truncated,
                Truncated = truncated,
                Text = text.Trim(),
                ErrorKind = truncated ? "truncated" : null
            };
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ChatCompletionResult { ErrorKind = "timeout" };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Gemini chat call failed.");
            return new ChatCompletionResult { ErrorKind = "exception" };
        }
    }

    private static string BuildSystem(ChatCompletionRequest request)
    {
        var lang = ExpandLanguageHint(request.LanguageHint);
        return
            $"{request.SystemInstruction}\n\nHOTEL_CONTEXT (trusted — use only these facts):\n{request.HotelContext}\n\n"
            + $"Tone: warm hotel receptionist, human and kind. Reply fully in {lang}. "
            + "If the guest asked several things, cover each one naturally. Never invent bookings, confirmation codes, room numbers, or payments.";
    }

    private static string ExpandLanguageHint(string? hint)
    {
        if (string.IsNullOrWhiteSpace(hint))
            return "English";
        return hint.Trim().ToLowerInvariant() switch
        {
            "ceb" or "bisaya" or "cebuano" => "Cebuano (Bisaya)",
            "fil" or "tl" => "Filipino (Tagalog)",
            "zh-hans" or "zh" or "zh-cn" => "Chinese (Simplified)",
            "ja" => "Japanese",
            "ko" => "Korean",
            "ru" => "Russian",
            "en" => "English",
            _ => hint
        };
    }

    private static bool LooksLikeQuota(string body) =>
        body.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase)
        || body.Contains("quota", StringComparison.OrdinalIgnoreCase)
        || body.Contains("rate limit", StringComparison.OrdinalIgnoreCase);

    private static string? ExtractGeminiFinishReason(JsonElement root)
    {
        if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            return null;
        return candidates[0].TryGetProperty("finishReason", out var fr) ? fr.GetString() : null;
    }

    private static string? ExtractGeminiText(JsonElement root)
    {
        if (!root.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            return null;
        var first = candidates[0];
        if (!first.TryGetProperty("content", out var content)
            || !content.TryGetProperty("parts", out var parts)
            || parts.GetArrayLength() == 0)
            return null;

        // Thinking models return thought parts (marked "thought": true) before the answer.
        var sb = new StringBuilder();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.TryGetProperty("thought", out var thought) && thought.GetBoolean())
                continue;
            if (part.TryGetProperty("text", out var text))
                sb.Append(text.GetString());
        }

        var answer = sb.ToString().Trim();
        return string.IsNullOrEmpty(answer) ? null : answer;
    }
}

public sealed class GroqChatProvider : IChatLlmProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ISecureConfigStore _vault;
    private readonly ChatbotOptions _options;
    private readonly ILogger<GroqChatProvider> _logger;

    public GroqChatProvider(
        IHttpClientFactory httpClientFactory,
        ISecureConfigStore vault,
        IOptions<ChatbotOptions> options,
        ILogger<GroqChatProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _vault = vault;
        _options = options.Value;
        _logger = logger;
    }

    public ChatProviderKind Kind => ChatProviderKind.Groq;

    public Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default) =>
        _vault.HasValueAsync(SecureSettingKeys.GroqApiKey, cancellationToken);

    public async Task<ChatCompletionResult> CompleteAsync(
        ChatCompletionRequest request,
        CancellationToken cancellationToken = default)
    {
        var apiKey = await _vault.GetAsync(SecureSettingKeys.GroqApiKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return new ChatCompletionResult { NotConfigured = true, ErrorKind = "not_configured" };
        }

        var model = string.IsNullOrWhiteSpace(_options.GroqModel) ? "openai/gpt-oss-20b" : _options.GroqModel.Trim();
        // Groq (OpenAI-compatible) requires the first non-system message to be "user".
        // Guest chat history often starts with the welcome assistant bubble — strip that.
        var history = NormalizeOpenAiHistory(request.History);

        var langHint = request.LanguageHint ?? "en";
        if (langHint is "ceb" or "bisaya" or "cebuano")
            langHint = "Cebuano (Bisaya)";
        else if (langHint is "fil" or "tl")
            langHint = "Filipino (Tagalog)";

        var messages = new List<object>
        {
            new
            {
                role = "system",
                content =
                    $"{request.SystemInstruction}\n\nHOTEL_CONTEXT:\n{request.HotelContext}\n\n"
                    + $"Tone: warm hotel receptionist. Reply fully in {langHint}. "
                    + "Answer every part of a complex guest message. Never invent bookings, MOR codes, room numbers, or payments."
            }
        };

        foreach (var turn in history)
        {
            messages.Add(new
            {
                role = turn.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase) ? "assistant" : "user",
                content = turn.Content
            });
        }

        messages.Add(new { role = "user", content = request.UserMessage });

        // Reasoning models (gpt-oss, qwen3) burn max_tokens on hidden reasoning —
        // pin effort low so guest chat stays fast and the answer budget isn't starved.
        var isReasoningModel =
            model.StartsWith("openai/gpt-oss", StringComparison.OrdinalIgnoreCase)
            || model.StartsWith("qwen/", StringComparison.OrdinalIgnoreCase);

        object payload = isReasoningModel
            ? new
            {
                model,
                temperature = request.Temperature,
                max_tokens = request.MaxOutputTokens,
                reasoning_effort = "low",
                messages
            }
            : new
            {
                model,
                temperature = request.Temperature,
                max_tokens = request.MaxOutputTokens,
                messages
            };

        try
        {
            var client = _httpClientFactory.CreateClient("chat-groq");
            using var httpRequest = new HttpRequestMessage(HttpMethod.Post, "openai/v1/chat/completions");
            httpRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey.Trim());
            httpRequest.Content = new StringContent(
                JsonSerializer.Serialize(payload),
                Encoding.UTF8,
                "application/json");

            using var response = await client.SendAsync(httpRequest, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);

            if (response.StatusCode == HttpStatusCode.TooManyRequests
                || (int)response.StatusCode == 429
                || IsGroqQuotaError(body))
            {
                _logger.LogWarning("Groq quota/rate limited for chat.");
                return new ChatCompletionResult { QuotaExhausted = true, ErrorKind = "quota" };
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Groq chat failed with {Status}: {Snippet}",
                    (int)response.StatusCode,
                    Truncate(body, 240));
                return new ChatCompletionResult { ErrorKind = "http_" + (int)response.StatusCode };
            }

            using var doc = JsonDocument.Parse(body);
            if (!doc.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
                return new ChatCompletionResult { ErrorKind = "empty" };

            var choice = choices[0];
            var truncated = choice.TryGetProperty("finish_reason", out var fr)
                && string.Equals(fr.GetString(), "length", StringComparison.OrdinalIgnoreCase);
            string? content = null;
            if (choice.TryGetProperty("message", out var message)
                && message.TryGetProperty("content", out var c)
                && c.ValueKind == JsonValueKind.String)
                content = c.GetString();
            if (string.IsNullOrWhiteSpace(content))
                return new ChatCompletionResult
                {
                    ErrorKind = truncated ? "truncated" : "empty",
                    Truncated = truncated
                };

            return new ChatCompletionResult
            {
                Succeeded = !truncated,
                Truncated = truncated,
                Text = content.Trim(),
                ErrorKind = truncated ? "truncated" : null
            };
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new ChatCompletionResult { ErrorKind = "timeout" };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Groq chat call failed.");
            return new ChatCompletionResult { ErrorKind = "exception" };
        }
    }

    /// <summary>
    /// Drop leading assistant turns and collapse consecutive same-role messages for OpenAI-style APIs.
    /// </summary>
    private static IReadOnlyList<ChatTurn> NormalizeOpenAiHistory(IReadOnlyList<ChatTurn> history)
    {
        if (history.Count == 0)
            return history;

        var list = history
            .Where(t => t is not null && !string.IsNullOrWhiteSpace(t.Content))
            .Select(t => new ChatTurn
            {
                Role = t.Role.Equals("assistant", StringComparison.OrdinalIgnoreCase) ? "assistant" : "user",
                Content = t.Content.Trim()
            })
            .ToList();

        while (list.Count > 0 && list[0].Role == "assistant")
            list.RemoveAt(0);

        if (list.Count == 0)
            return Array.Empty<ChatTurn>();

        var merged = new List<ChatTurn>(list.Count);
        foreach (var turn in list)
        {
            if (merged.Count > 0 && merged[^1].Role == turn.Role)
            {
                merged[^1] = new ChatTurn
                {
                    Role = turn.Role,
                    Content = merged[^1].Content + "\n" + turn.Content
                };
            }
            else
            {
                merged.Add(turn);
            }
        }

        return merged;
    }

    private static bool IsGroqQuotaError(string body) =>
        body.Contains("rate_limit_exceeded", StringComparison.OrdinalIgnoreCase)
        || body.Contains("insufficient_quota", StringComparison.OrdinalIgnoreCase)
        || body.Contains("tokens per day", StringComparison.OrdinalIgnoreCase)
        || body.Contains("TPD", StringComparison.Ordinal)
        || body.Contains("\"code\":\"rate_limit", StringComparison.OrdinalIgnoreCase);

    private static string Truncate(string value, int max) =>
        string.IsNullOrEmpty(value) ? string.Empty
        : value.Length <= max ? value
        : value[..max] + "…";
}
