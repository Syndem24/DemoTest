using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using TestingDemo.Models;

namespace TestingDemo.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;

        public HomeController(ILogger<HomeController> logger)
        {
            _logger = logger;
        }

        public IActionResult Index()
        {
            // Public visitors land on the guest booking site.
            return RedirectToAction("Index", "Booking");
        }

        public IActionResult Privacy()
        {
            return View();
        }

        [Route("Home/NotFoundPage")]
        [Route("NotFound")]
        [Route("404")]
        public IActionResult NotFoundPage()
        {
            Response.StatusCode = 404;
            return View("NotFound");
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
