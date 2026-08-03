using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

public sealed class AdminBookingsController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }
}
