using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using TestingDemo.Options;

namespace TestingDemo.Services.Chat;

public interface IChatConversationStore
{
    IReadOnlyList<ChatTurn> Get(HttpContext http);
    void Save(HttpContext http, IReadOnlyList<ChatTurn> turns);
}

/// <summary>
/// Short conversation memory in the ASP.NET session (no SQL transcript).
/// Client sessionStorage also keeps UI state across guest page navigations.
/// </summary>
public sealed class ChatConversationStore : IChatConversationStore
{
    private const string SessionKey = "mori.chat.turns.v1";
    private readonly ChatbotOptions _options;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public ChatConversationStore(IOptions<ChatbotOptions> options)
    {
        _options = options.Value;
    }

    public IReadOnlyList<ChatTurn> Get(HttpContext http)
    {
        var raw = http.Session.GetString(SessionKey);
        if (string.IsNullOrWhiteSpace(raw))
            return Array.Empty<ChatTurn>();

        try
        {
            var turns = JsonSerializer.Deserialize<List<ChatTurn>>(raw, JsonOptions);
            return turns ?? (IReadOnlyList<ChatTurn>)Array.Empty<ChatTurn>();
        }
        catch
        {
            return Array.Empty<ChatTurn>();
        }
    }

    public void Save(HttpContext http, IReadOnlyList<ChatTurn> turns)
    {
        var max = Math.Clamp(_options.HistoryTurns, 2, 16);
        var trimmed = turns.Count <= max ? turns : turns.Skip(turns.Count - max).ToList();
        http.Session.SetString(SessionKey, JsonSerializer.Serialize(trimmed, JsonOptions));
    }
}
