using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

public class BookingController : Controller
{
    private readonly IRoomService _roomService;

    public BookingController(IRoomService roomService)
    {
        _roomService = roomService;
    }

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        return View(await BuildPageModelAsync(cancellationToken));
    }

    [HttpGet]
    public async Task<IActionResult> Accommodations(CancellationToken cancellationToken)
    {
        return View(await BuildPageModelAsync(cancellationToken));
    }

    private async Task<BookingPageViewModel> BuildPageModelAsync(CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var available = rooms
            .Where(r => r.Status == RoomStatus.Available)
            .ToList();

        var model = new BookingPageViewModel
        {
            AvailableRooms = available,
            RoomTypes = RoomIndexViewModel.FromRooms(available).RoomTypes
                .Where(t => t.AvailableCount > 0)
                .ToList()
        };

        return model;
    }
}
