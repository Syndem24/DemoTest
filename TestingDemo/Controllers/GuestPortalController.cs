using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;

namespace TestingDemo.Controllers;

/// <summary>
/// Guest portal stubs (Review / booking history) — promise surfaces until persistence is wired.
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

    [HttpGet]
    public IActionResult BookingHistory()
    {
        ViewData["Title"] = "Booking history";
        return View();
    }
}
