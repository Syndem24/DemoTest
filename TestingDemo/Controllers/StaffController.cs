using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

public class StaffController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Enter()
    {
        return RedirectToAction("Index", "Rooms");
    }
}
