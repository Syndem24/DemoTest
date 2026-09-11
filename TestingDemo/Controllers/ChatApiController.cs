using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TestingDemo.Services.Chat;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/chat")]
[AllowAnonymous]
public sealed class ChatApiController : ControllerBase
{
    private readonly IChatOrchestrator _chat;
    private readonly ILogger<ChatApiController> _logger;

    public ChatApiController(IChatOrchestrator chat, ILogger<ChatApiController> logger)
    {
        _chat = chat;
        _logger = logger;
    }

    [HttpGet("welcome")]
    [EnableRateLimiting("guest-chat")]
    public async Task<ActionResult<ChatWelcomeResponse>> Welcome(CancellationToken cancellationToken)
    {
        try
        {
            var welcome = await _chat.WelcomeAsync(cancellationToken);
            return Ok(welcome);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Guest chat welcome failed.");
            return Ok(new ChatWelcomeResponse
            {
                Reply = "Welcome to Mori International Hotel. How can we help you today?",
                AssistantName = "Mori Assistant",
                ChatEnabled = true,
                Suggestions = Array.Empty<string>()
            });
        }
    }

    [HttpPost("message")]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-chat")]
    public async Task<ActionResult<ChatMessageResponse>> Message(
        [FromBody] ChatMessageRequest? request,
        CancellationToken cancellationToken)
    {
        var message = request?.Message?.Trim() ?? string.Empty;
        if (message.Length == 0)
            return BadRequest(new { message = "Message is required." });

        if (message.Length > 2000)
            return BadRequest(new { message = "Message is too long. Please keep it under 2000 characters." });

        var history = (request?.History ?? new List<ChatTurnDto>())
            .Take(40)
            .Select(t => new ChatTurn
            {
                Role = t.Role ?? "user",
                Content = t.Content ?? string.Empty
            });

        try
        {
            var result = await _chat.ReplyAsync(
                HttpContext,
                message,
                request?.Lang,
                history,
                cancellationToken);

            return Ok(new ChatMessageResponse
            {
                Reply = result.Reply,
                UsedAiFallback = result.UsedAiFallback
            });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Guest chat reply failed.");
            return Ok(new ChatMessageResponse
            {
                Reply = "Sorry — something went wrong on our side. Please try again, or call the front desk.",
                UsedAiFallback = false
            });
        }
    }
}
