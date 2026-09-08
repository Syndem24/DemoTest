using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;

namespace TestingDemo.Controllers;

/// <summary>
/// Guest portal surfaces for guest reviews.
/// </summary>
[Authorize(Roles = $"{AppRoles.Guest},{AppRoles.AdminManager},{AppRoles.Receptionist}")]
public sealed class GuestPortalController : Controller
{
    [HttpGet]
    public IActionResult Reviews()
    {
        ViewData["Title"] = "Reviews";
        return View();
    }
}
