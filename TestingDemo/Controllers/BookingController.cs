using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

public class BookingController : Controller
{
    private readonly IRoomService _roomService;
    private readonly IStayReviewService _reviews;
    private readonly IGoogleAuthSettings _googleAuth;

    public BookingController(
        IRoomService roomService,
        IStayReviewService reviews,
        IGoogleAuthSettings googleAuth)
    {
        _roomService = roomService;
        _reviews = reviews;
        _googleAuth = googleAuth;
    }

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        return View(await BuildPageModelAsync(takeReviews: 8, cancellationToken));
    }

    [HttpGet]
    public async Task<IActionResult> Accommodations(CancellationToken cancellationToken)
    {
        return View(await BuildPageModelAsync(takeReviews: 3, cancellationToken));
    }

    [HttpGet("/plan")]
    public IActionResult Plan() => Redirect("/#room-types");

    private async Task<BookingPageViewModel> BuildPageModelAsync(int takeReviews, CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var available = rooms
            .Where(r => r.Status == RoomStatus.Available)
            .ToList();

        var model = new BookingPageViewModel
        {
            AvailableRooms = available,
            RoomTypes = RoomIndexViewModel.FromRooms(rooms).RoomTypes.ToList(),
            GoogleGuestSignedIn = User.IsInRole(AppRoles.Guest),
            GoogleLoginEnabled = await _googleAuth.IsLoginButtonVisibleAsync(cancellationToken)
        };

        if (takeReviews > 0)
        {
            var reviewPage = await _reviews.GetPublicAsync(takeReviews, cancellationToken);
            model.ReviewAverage = reviewPage.AverageOverall;
            model.ReviewCount = reviewPage.ReviewCount;
            model.Reviews = reviewPage.Items;
        }

        return model;
    }

    [HttpGet]
    public async Task<IActionResult> Terms()
    {
        ViewData["Title"] = "Terms and policies";
        await SetLegalNavAsync();
        return View();
    }

    [HttpGet]
    public async Task<IActionResult> PrivacyPolicy()
    {
        ViewData["Title"] = "Privacy policy";
        await SetLegalNavAsync();
        return View();
    }

    private async Task SetLegalNavAsync()
    {
        await HttpContext.Session.LoadAsync();
        var fromAgreement = string.Equals(
            Request.Query["from"],
            "guest-agreement",
            StringComparison.OrdinalIgnoreCase);
        ViewBag.ReturnToGuestAgreement = fromAgreement
            || GoogleGuestPendingSession.TryGet(
                HttpContext.Session,
                out _,
                out _,
                out _,
                out _,
                out _,
                out _);
    }
}
