using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
public sealed class DashboardController : Controller
{
    private const int MaxLayoutJsonLength = 8000;
    private static readonly JsonSerializerOptions LayoutJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly IDashboardAnalyticsService _analytics;
    private readonly UserManager<ApplicationUser> _userManager;

    public DashboardController(
        IDashboardAnalyticsService analytics,
        UserManager<ApplicationUser> userManager)
    {
        _analytics = analytics;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        var user = await _userManager.GetUserAsync(User);
        var isAdmin = User.IsInRole(AppRoles.AdminManager);
        var role = isAdmin ? "AdminManager" : "Receptionist";
        var snapshot = await _analytics.GetSnapshotAsync(isAdmin, role, cancellationToken);
        ViewBag.DashboardLayoutJson = user?.DashboardLayoutJson;
        return View(snapshot);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> SaveLayout([FromBody] JsonElement? payload, CancellationToken cancellationToken)
    {
        if (payload is null || payload.Value.ValueKind != JsonValueKind.Array)
            return BadRequest(new { message = "Layout must be a JSON array." });

        var json = payload.Value.GetRawText();
        if (json.Length > MaxLayoutJsonLength)
            return BadRequest(new { message = "Layout is too large." });

        if (!TryParseLayout(json, out var nodes))
            return BadRequest(new { message = "Layout format is invalid." });

        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Unauthorized();

        user.DashboardLayoutJson = JsonSerializer.Serialize(nodes, LayoutJsonOptions);
        var result = await _userManager.UpdateAsync(user);
        if (!result.Succeeded)
            return StatusCode(500, new { message = "Could not save dashboard layout." });

        return Ok(new { message = "Layout saved." });
    }

    private static bool TryParseLayout(string json, out List<DashboardLayoutNode> nodes)
    {
        nodes = [];
        try
        {
            var parsed = JsonSerializer.Deserialize<List<DashboardLayoutNode>>(json, LayoutJsonOptions);
            if (parsed is null || parsed.Count > 24)
                return false;

            foreach (var node in parsed)
            {
                if (string.IsNullOrWhiteSpace(node.Id) || node.Id.Length > 40)
                    return false;
                if (node.W is < 1 or > 12 || node.H is < 1 or > 24)
                    return false;
                if (node.X is < 0 or > 11 || node.Y is < 0 or > 200)
                    return false;
            }

            nodes = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private sealed record DashboardLayoutNode(string Id, int X, int Y, int W, int H);
}
