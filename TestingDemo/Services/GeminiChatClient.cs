using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class GeminiChatResult
{
    public bool IsConfigured { get; init; }
    public string Message { get; init; } = string.Empty;
}

public interface IGeminiChatClient
{
    Task<GeminiChatResult> CompleteAsync(string prompt, CancellationToken cancellationToken = default);
}

/// <summary>
/// Promise stub: reports whether a Gemini key is stored. No live chatbot calls yet.
/// </summary>
public sealed class GeminiChatClient : IGeminiChatClient
{
    private readonly ISecureConfigStore _vault;

    public GeminiChatClient(ISecureConfigStore vault)
    {
        _vault = vault;
    }

    public async Task<GeminiChatResult> CompleteAsync(string prompt, CancellationToken cancellationToken = default)
    {
        _ = prompt;
        var configured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
        if (!configured)
        {
            return new GeminiChatResult
            {
                IsConfigured = false,
                Message = "Gemini is not configured."
            };
        }

        return new GeminiChatResult
        {
            IsConfigured = true,
            Message = "Gemini key is stored. Chatbot UI is not implemented yet."
        };
    }
}
