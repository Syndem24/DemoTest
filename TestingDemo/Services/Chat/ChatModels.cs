namespace TestingDemo.Services.Chat;

public enum ChatProviderKind
{
    Gemini,
    Groq,
    Desk
}

public sealed class ChatTurn
{
    public string Role { get; set; } = "user";
    public string Content { get; set; } = string.Empty;
}

public sealed class ChatCompletionRequest
{
    public required string SystemInstruction { get; init; }
    public required string HotelContext { get; init; }
    public required IReadOnlyList<ChatTurn> History { get; init; }
    public required string UserMessage { get; init; }
    public string? LanguageHint { get; init; }
    public int MaxOutputTokens { get; init; } = 320;
    public double Temperature { get; init; } = 0.3;
}

public sealed class ChatCompletionResult
{
    public bool Succeeded { get; init; }
    public bool NotConfigured { get; init; }
    public bool QuotaExhausted { get; init; }
    public string? Text { get; init; }
    public string? ErrorKind { get; init; }
}

public sealed class ChatReplyResult
{
    public required string Reply { get; init; }
    public string Outcome { get; init; } = "unknown";
    /// <summary>True when Gemini or Groq produced the guest-visible reply.</summary>
    public bool UsedAiFallback { get; init; }
}

public sealed class ChatMessageRequest
{
    public string? Message { get; set; }
    public string? Lang { get; set; }
    public List<ChatTurnDto>? History { get; set; }
}

public sealed class ChatTurnDto
{
    public string? Role { get; set; }
    public string? Content { get; set; }
}

public sealed class ChatWelcomeResponse
{
    public required string Reply { get; init; }
    public required string AssistantName { get; init; }
    public bool ChatEnabled { get; init; }
    public IReadOnlyList<string> Suggestions { get; init; } = Array.Empty<string>();
    public string? DeskPhone { get; init; }
    public string? DeskPhoneAlt { get; init; }
}

public sealed class ChatMessageResponse
{
    public required string Reply { get; init; }
    /// <summary>True when the reply came from Gemini or Groq.</summary>
    public bool UsedAiFallback { get; init; }
}
