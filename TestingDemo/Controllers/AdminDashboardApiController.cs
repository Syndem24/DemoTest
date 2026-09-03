using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
[ApiController]
[Route("api/admin/dashboard")]
public sealed class AdminDashboardApiController : ControllerBase
{
    private readonly IDashboardAnalyticsService _analytics;

    public AdminDashboardApiController(IDashboardAnalyticsService analytics)
    {
        _analytics = analytics;
    }

    [HttpGet("snapshot")]
    public async Task<ActionResult<DashboardSnapshot>> GetSnapshot(CancellationToken cancellationToken)
    {
        var isAdmin = User.IsInRole(AppRoles.AdminManager);
        var role = isAdmin ? "AdminManager" : "Receptionist";
        var snapshot = await _analytics.GetSnapshotAsync(isAdmin, role, cancellationToken);
        return Ok(snapshot);
    }
}
