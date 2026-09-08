using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/guest/reviews")]
public sealed class GuestReviewsApiController : ControllerBase
{
    private readonly IStayReviewService _reviews;
    private readonly UserManager<ApplicationUser> _users;

    public GuestReviewsApiController(IStayReviewService reviews, UserManager<ApplicationUser> users)
    {
        _reviews = reviews;
        _users = users;
    }

    [HttpGet("public")]
    [AllowAnonymous]
    public async Task<ActionResult<StayReviewPublicPageDto>> GetPublic(
        [FromQuery] int take = 12,
        CancellationToken cancellationToken = default)
    {
        var page = await _reviews.GetPublicAsync(take, cancellationToken);
        return Ok(page);
    }

    [HttpGet("portal")]
    [Authorize(Roles = $"{AppRoles.Guest},{AppRoles.AdminManager},{AppRoles.Receptionist}")]
    public async Task<ActionResult<StayReviewPortalPageDto>> GetPortal(CancellationToken cancellationToken)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        var page = await _reviews.GetPortalAsync(
            user.Id,
            user.Email,
            user.GoogleEmail,
            cancellationToken);
        return Ok(page);
    }

    [HttpPost]
    [Authorize(Roles = AppRoles.Guest)]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-bookings")]
    public async Task<ActionResult<StayReviewMineDto>> Create(
        [FromBody] StayReviewWriteRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        try
        {
            var created = await _reviews.CreateAsync(
                user.Id,
                user.Email,
                user.GoogleEmail,
                user.FullName,
                request ?? new(),
                cancellationToken);
            return Ok(created);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Stay was not found." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    [Authorize(Roles = AppRoles.Guest)]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-bookings")]
    public async Task<ActionResult<StayReviewMineDto>> Update(
        int id,
        [FromBody] StayReviewWriteRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId)) return Unauthorized();

        try
        {
            var updated = await _reviews.UpdateAsync(id, userId, request ?? new(), cancellationToken);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Review was not found." });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}
