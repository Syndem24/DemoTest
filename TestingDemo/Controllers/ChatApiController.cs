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

    public ChatApiController(IChatOrchestrator chat)
    {
        _chat = chat;
    }

    [HttpGet("welcome")]
    [EnableRateLimiting("guest-chat")]
    public async Task<ActionResult<ChatWelcomeResponse>> Welcome(CancellationToken cancellationToken)
    {
        var welcome = await _chat.WelcomeAsync(cancellationToken);
        return Ok(welcome);
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

        var history = (request?.History ?? new List<ChatTurnDto>())
            .Select(t => new ChatTurn
            {
                Role = t.Role ?? "user",
                Content = t.Content ?? string.Empty
            });

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
}
