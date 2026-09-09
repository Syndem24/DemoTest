using TestingDemo.Models;
using TestingDemo.Services.Chat;

namespace TestingDemo.Services;

/// <summary>
/// Legacy probe used by older DI wiring. Prefer <see cref="IChatOrchestrator"/>.
/// </summary>
public interface IGeminiChatClient
{
    Task<GeminiChatResult> CompleteAsync(string prompt, CancellationToken cancellationToken = default);
}

public sealed class GeminiChatResult
{
    public bool IsConfigured { get; init; }
    public string Message { get; init; } = string.Empty;
}

public sealed class GeminiChatClient : IGeminiChatClient
{
    private readonly IChatLlmProvider _gemini;

    public GeminiChatClient(IEnumerable<IChatLlmProvider> providers)
    {
        _gemini = providers.First(p => p.Kind == ChatProviderKind.Gemini);
    }

    public async Task<GeminiChatResult> CompleteAsync(string prompt, CancellationToken cancellationToken = default)
    {
        _ = prompt;
        var configured = await _gemini.IsConfiguredAsync(cancellationToken);
        return new GeminiChatResult
        {
            IsConfigured = configured,
            Message = configured
                ? "Gemini key is stored."
                : "Gemini is not configured."
        };
    }
}
