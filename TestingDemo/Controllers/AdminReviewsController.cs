using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;

namespace TestingDemo.Controllers;

[Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
public sealed class AdminReviewsController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        ViewData["Title"] = "Review moderation";
        return View();
    }
}
