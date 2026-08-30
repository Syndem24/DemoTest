using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TestingDemo.Controllers;

[Authorize(Roles = "AdminManager,Receptionist")]
public sealed class AdminPaymentsController : Controller
{
    [HttpGet]
    public IActionResult Index()
    {
        return View();
    }
}
