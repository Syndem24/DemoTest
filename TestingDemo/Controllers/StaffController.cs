using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

/// <summary>
/// Temporary staff entry (no real authorization yet).
/// </summary>
public class StaffController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }

    /// <summary>
    /// Placeholder staff gate. Always continues for now.
    /// Replace with real login/auth later.
    /// </summary>
    [HttpPost]
    [ValidateAntiForgeryToken]
    public Task<IActionResult> Enter()
    {
        // PROMISE / PLACEHOLDER AUTH:
        // No password, roles, or session checks yet.
        // When auth is added, validate credentials here, then redirect.
        return Task.FromResult<IActionResult>(RedirectToAction("Index", "Rooms"));
    }
}
