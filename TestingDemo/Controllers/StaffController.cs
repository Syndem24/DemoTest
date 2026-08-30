using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

/// <summary>Staff portal entry — redirects to Account login.</summary>
public class StaffController : Controller
{
    [HttpGet]
    [AllowAnonymous]
    public IActionResult Index(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
            return RedirectToAction("Index", "Dashboard");

        // Keep /Staff bookmark working; login UI lives on Account.
        return RedirectToAction("Login", "Account", new { returnUrl });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public IActionResult Enter()
    {
        return RedirectToAction("Login", "Account");
    }
}
