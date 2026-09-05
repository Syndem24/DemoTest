using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.DTOs;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/shifts")]
[Authorize(Roles = "AdminManager,Receptionist")]
public sealed class AdminShiftsApiController : ControllerBase
{
    private readonly IStaffShiftService _shifts;
    private readonly ISystemAuditRecorder _audit;

    public AdminShiftsApiController(IStaffShiftService shifts, ISystemAuditRecorder audit)
    {
        _shifts = shifts;
        _audit = audit;
    }

    [HttpGet]
    public async Task<ActionResult<StaffShiftPageDto>> GetPage(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        var (userId, displayName, isAdmin) = Actor();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var result = await _shifts.GetPageAsync(
            userId, displayName, isAdmin, page, pageSize, cancellationToken);
        return Ok(result);
    }

    [HttpGet("current")]
    public async Task<ActionResult<StaffShiftDto?>> GetCurrent(CancellationToken cancellationToken)
    {
        var (userId, _, _) = Actor();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        var current = await _shifts.GetOpenShiftAsync(userId, cancellationToken);
        return Ok(current);
    }

    [HttpGet("desk")]
    public async Task<ActionResult<object>> GetDeskStatus(CancellationToken cancellationToken)
    {
        var anyoneOnShift = await _shifts.AnyOpenShiftAsync(cancellationToken);
        return Ok(new { anyoneOnShift });
    }

    [HttpPost("start")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<StaffShiftDto>> Start(
        [FromBody] StartStaffShiftRequest request,
        CancellationToken cancellationToken)
    {
        var (userId, displayName, _) = Actor();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        try
        {
            var shift = await _shifts.StartAsync(userId, displayName, request ?? new(), cancellationToken);
            return Ok(shift);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPut("{id:int}/briefing")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<StaffShiftDto>> SaveBriefing(
        int id,
        [FromBody] UpdateStaffShiftBriefingRequest request,
        CancellationToken cancellationToken)
    {
        var (userId, _, isAdmin) = Actor();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        try
        {
            var shift = await _shifts.UpdateBriefingAsync(
                id, userId, isAdmin, request ?? new(), cancellationToken);
            return Ok(shift);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/end")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<StaffShiftDto>> End(
        int id,
        [FromBody] EndStaffShiftRequest request,
        CancellationToken cancellationToken)
    {
        var (userId, _, isAdmin) = Actor();
        if (string.IsNullOrWhiteSpace(userId))
            return Unauthorized();

        try
        {
            var shift = await _shifts.EndAsync(id, userId, isAdmin, request ?? new(), cancellationToken);
            return Ok(shift);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
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

    private (string UserId, string DisplayName, bool IsAdminManager) Actor()
    {
        var actor = _audit.CurrentActor();
        var userId = actor.UserId;
        if (string.IsNullOrWhiteSpace(userId))
            userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
        var displayName = string.IsNullOrWhiteSpace(actor.DisplayName)
            ? (User.Identity?.Name ?? "Staff")
            : actor.DisplayName;
        return (userId, displayName, User.IsInRole("AdminManager"));
    }
}
