using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

[Authorize(Roles = "AdminManager,Receptionist")]
public sealed class AdminShiftsController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        ViewData["Title"] = "Shift";
        ViewData["StaffDisplayName"] =
            User.FindFirstValue("FullName")
            ?? User.Identity?.Name
            ?? "Staff";
        ViewData["IsAdminManager"] = User.IsInRole("AdminManager");
        return View();
    }
}
