using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

public sealed class WalkInController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return RedirectToAction("Index", "AdminBookings", new { walkin = 1 });
    }
}
