using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[Authorize(Roles = AppRoles.AdminManager)]
[ApiController]
[Route("api/admin/audit")]
public sealed class AdminAuditApiController : ControllerBase
{
    private readonly ISystemAuditQuery _auditQuery;

    public AdminAuditApiController(ISystemAuditQuery auditQuery)
    {
        _auditQuery = auditQuery;
    }

    [HttpGet("recent")]
    public async Task<ActionResult<PagedSystemAuditLogsDto>> GetRecent(
        [FromQuery] int page = 1,
        [FromQuery] SystemAuditDomain? domain = null,
        [FromQuery] string? q = null,
        CancellationToken cancellationToken = default)
    {
        var result = await _auditQuery.GetPagedAsync(
            q,
            intent: null,
            domain,
            page,
            SystemAuditRecorder.DefaultPageSize,
            cancellationToken);
        return Ok(result);
    }
}
