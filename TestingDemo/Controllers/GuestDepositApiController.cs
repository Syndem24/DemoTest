using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TestingDemo.DTOs;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

/// <summary>
/// Anonymous guest deposit checkout. The per-booking pay token (returned once at
/// booking creation) is the credential — wrong tokens look exactly like missing
/// bookings (404).
/// </summary>
[ApiController]
[Route("api/guest/deposit")]
[AllowAnonymous]
public sealed class GuestDepositApiController : ControllerBase
{
    private readonly IXenditQrPaymentService _xendit;

    public GuestDepositApiController(IXenditQrPaymentService xendit)
    {
        _xendit = xendit;
    }

    [HttpGet("methods")]
    public async Task<ActionResult<GuestDepositMethodsDto>> GetMethods(
        CancellationToken cancellationToken)
    {
        var enabled = await _xendit.IsConfiguredAsync(cancellationToken);
        return Ok(new GuestDepositMethodsDto(
            enabled,
            enabled,
            PaymentBrandCatalog.QrPh,
            PaymentBrandCatalog.Card));
    }

    [HttpPost("{bookingId:int}/intent")]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-deposit")]
    public async Task<ActionResult<QrPaymentIntentDto>> CreateIntent(
        int bookingId,
        [FromBody] GuestDepositIntentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var origin = $"{Request.Scheme}://{Request.Host}";
            return Ok(await _xendit.CreateGuestDepositAsync(
                bookingId, request.PayToken, request.Channel, origin, cancellationToken));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (XenditApiException ex)
        {
            return StatusCode(502, new { message = ex.Message });
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return StatusCode(502, new { message = "Xendit did not respond. Try again." });
        }
    }

    [HttpGet("by-reference/{reference}/current")]
    public async Task<ActionResult<QrPaymentIntentDto>> GetCurrentByReference(
        string reference,
        [FromQuery] string? payToken,
        CancellationToken cancellationToken)
    {
        try
        {
            var intent = await _xendit.GetCurrentGuestByReferenceAsync(
                reference, payToken ?? string.Empty, cancellationToken);
            return intent is null ? NotFound() : Ok(intent);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
    }

    [HttpGet("{bookingId:int}/intent/current")]
    public async Task<ActionResult<QrPaymentIntentDto>> GetCurrentIntent(
        int bookingId,
        [FromQuery] string? payToken,
        CancellationToken cancellationToken)
    {
        try
        {
            var intent = await _xendit.GetCurrentGuestAsync(bookingId, payToken ?? string.Empty, cancellationToken);
            return intent is null ? NotFound() : Ok(intent);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
    }

    [HttpGet("{bookingId:int}/intent/{intentId:int}")]
    public async Task<ActionResult<QrPaymentIntentDto>> GetIntent(
        int bookingId,
        int intentId,
        [FromQuery] string? payToken,
        [FromQuery] bool reconcile,
        CancellationToken cancellationToken)
    {
        try
        {
            var intent = await _xendit.GetGuestAsync(
                bookingId, intentId, payToken ?? string.Empty, reconcile, cancellationToken);
            return intent is null ? NotFound() : Ok(intent);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
    }

    [HttpPost("{bookingId:int}/intent/{intentId:int}/cancel")]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-deposit")]
    public async Task<ActionResult<QrPaymentIntentDto>> CancelIntent(
        int bookingId,
        int intentId,
        [FromBody] GuestDepositTokenRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _xendit.CancelGuestAsync(
                bookingId, intentId, request.PayToken, cancellationToken));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
    }
}
