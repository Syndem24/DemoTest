using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

/// <summary>
/// Xendit Payments API callbacks. Anonymous + no antiforgery by design — the
/// shared webhook token in the x-callback-token header is the auth check.
/// Always 200 for verified requests (even unknown/duplicate) so Xendit stops retrying.
/// </summary>
[ApiController]
[Route("api/webhooks/xendit")]
[AllowAnonymous]
[IgnoreAntiforgeryToken]
public sealed class XenditWebhookController : ControllerBase
{
    private const int MaxBodyBytes = 16 * 1024;

    private readonly IXenditQrPaymentService _xendit;

    public XenditWebhookController(IXenditQrPaymentService xendit)
    {
        _xendit = xendit;
    }

    [HttpPost("payments")]
    public async Task<IActionResult> Payments(CancellationToken cancellationToken)
    {
        if (Request.ContentLength > MaxBodyBytes)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        var callbackToken = Request.Headers["x-callback-token"].ToString();

        JsonDocument body;
        try
        {
            using var reader = new StreamReader(Request.Body);
            var text = await reader.ReadToEndAsync(cancellationToken);
            if (Encoding.UTF8.GetByteCount(text) > MaxBodyBytes)
            {
                return StatusCode(StatusCodes.Status413PayloadTooLarge);
            }

            body = JsonDocument.Parse(text);
        }
        catch (JsonException)
        {
            return BadRequest();
        }

        using (body)
        {
            var accepted = await _xendit.HandleWebhookAsync(callbackToken, body, cancellationToken);
            if (!accepted)
            {
                return Unauthorized();
            }
        }

        return Ok();
    }
}
