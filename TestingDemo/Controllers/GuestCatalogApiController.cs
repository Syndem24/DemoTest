using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/guest")]
[AllowAnonymous]
public sealed class GuestCatalogApiController : ControllerBase
{
    private readonly IRoomService _roomService;

    public GuestCatalogApiController(IRoomService roomService)
    {
        _roomService = roomService;
    }

    /// <summary>Room type summaries for guest accommodations (prices, inclusions, availability).</summary>
    [HttpGet("room-types")]
    public async Task<ActionResult<IReadOnlyList<RoomTypeSummaryViewModel>>> GetRoomTypes(
        CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        return Ok(RoomIndexViewModel.FromRooms(rooms).RoomTypes);
    }
}
