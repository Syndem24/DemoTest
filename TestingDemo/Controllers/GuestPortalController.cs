using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;

namespace TestingDemo.Controllers;

/// <summary>
/// Guest portal surfaces for booking management and reviews.
/// </summary>
[Authorize(Roles = $"{AppRoles.Guest},{AppRoles.AdminManager},{AppRoles.Receptionist}")]
public sealed class GuestPortalController : Controller
{
    [HttpGet]
    public IActionResult Bookings()
    {
        ViewData["Title"] = "My bookings";
        ViewData["I18nTitle"] = "bookingsPortal.title";
        ViewData["GuestImmersive"] = true;
        ViewData["GuestFullBleed"] = true;
        return View();
    }

    [HttpGet("Reviews")]
    public IActionResult Reviews() => RedirectToAction(nameof(Bookings));
}
