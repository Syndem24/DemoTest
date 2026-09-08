using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/reviews")]
[Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
public sealed class AdminReviewsApiController : ControllerBase
{
    private readonly IStayReviewService _reviews;

    public AdminReviewsApiController(IStayReviewService reviews)
    {
        _reviews = reviews;
    }

    [HttpGet]
    public async Task<ActionResult<AdminStayReviewPageDto>> GetPage(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string replyState = "all",
        CancellationToken cancellationToken = default)
    {
        var result = await _reviews.GetAdminPageAsync(page, pageSize, replyState, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<AdminStayReviewDto>> GetDetail(
        int id,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var detail = await _reviews.GetAdminDetailAsync(id, cancellationToken);
            return Ok(detail);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Review was not found." });
        }
    }

    [HttpPut("{id:int}/publish")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<AdminStayReviewDto>> SetPublishState(
        int id,
        [FromBody] UpdateStayReviewPublishRequest request,
        CancellationToken cancellationToken)
    {
        var actorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(actorUserId)) return Unauthorized();
        var actorDisplayName = User.FindFirstValue("FullName") ?? User.Identity?.Name ?? "Admin";

        try
        {
            var updated = await _reviews.SetPublishStateAsync(
                id,
                request?.IsPublished ?? false,
                actorUserId,
                actorDisplayName,
                cancellationToken);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Review was not found." });
        }
    }

    [HttpPut("{id:int}/reply")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<AdminStayReviewDto>> SetReply(
        int id,
        [FromBody] UpsertStayReviewReplyRequest request,
        CancellationToken cancellationToken)
    {
        var actorUserId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(actorUserId)) return Unauthorized();
        var actorDisplayName = User.FindFirstValue("FullName") ?? User.Identity?.Name ?? "Admin";

        try
        {
            var updated = await _reviews.UpsertHotelReplyAsync(
                id,
                request?.Reply,
                actorUserId,
                actorDisplayName,
                cancellationToken);
            return Ok(updated);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Review was not found." });
        }
    }
}
