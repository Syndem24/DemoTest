using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

public sealed class AdminPaymentsController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }
}
