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
    private readonly IWebHostEnvironment _environment;

    public AdminDashboardApiController(
        IDashboardAnalyticsService analytics,
        IWebHostEnvironment environment)
    {
        _analytics = analytics;
        _environment = environment;
    }

    [HttpGet("snapshot")]
    public async Task<ActionResult<DashboardSnapshot>> GetSnapshot(CancellationToken cancellationToken)
    {
        var isAdmin = User.IsInRole(AppRoles.AdminManager);
        var role = isAdmin ? "AdminManager" : "Receptionist";
        var snapshot = await _analytics.GetSnapshotAsync(isAdmin, role, cancellationToken);
        return Ok(snapshot);
    }

    /// <summary>Printable operations report — bookings, reservations, payment
    /// ledger, and room status tables plus chart aggregates for the last page.
    /// From/to are inclusive Manila calendar dates.</summary>
    [HttpGet("report")]
    public async Task<ActionResult<DashboardReportDto>> GetReport(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken cancellationToken)
    {
        if (!from.HasValue || !to.HasValue)
        {
            return BadRequest("Choose both from and to dates.");
        }

        var generatedBy = User.Identity?.Name
            ?? (User.IsInRole(AppRoles.AdminManager) ? AppRoles.AdminManager : AppRoles.Receptionist);
        try
        {
            var report = await _analytics.GetReportAsync(generatedBy, from.Value, to.Value, cancellationToken);
            return Ok(report);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    /// <summary>Branded PDF of the same operations report — what the preview shows
    /// is what this file contains. Logo + trademark on every page.</summary>
    [HttpGet("report.pdf")]
    public async Task<IActionResult> GetReportPdf(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken cancellationToken)
    {
        if (!from.HasValue || !to.HasValue)
        {
            return BadRequest("Choose both from and to dates.");
        }

        var generatedBy = User.Identity?.Name
            ?? (User.IsInRole(AppRoles.AdminManager) ? AppRoles.AdminManager : AppRoles.Receptionist);
        try
        {
            var report = await _analytics.GetReportAsync(generatedBy, from.Value, to.Value, cancellationToken);
            var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
            var pdf = OperationsReportPdfBuilder.Build(report, logoPath);
            return File(
                pdf,
                "application/pdf",
                $"mori-operations-report-{from.Value:yyyyMMdd}-to-{to.Value:yyyyMMdd}.pdf");
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
