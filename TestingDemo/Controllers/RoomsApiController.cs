using Microsoft.AspNetCore.Mvc;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/rooms")]
public class RoomsApiController : ControllerBase
{
    private readonly IRoomService _roomService;

    public RoomsApiController(IRoomService roomService)
    {
        _roomService = roomService;
    }

    [HttpGet("types")]
    public async Task<ActionResult<IReadOnlyList<RoomTypeSummaryViewModel>>> GetTypes(
        CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        return Ok(RoomIndexViewModel.FromRooms(rooms).RoomTypes);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<object>>> GetRooms(CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var payload = rooms
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase)
            .Select(r => new
            {
                r.Id,
                r.RoomTypeId,
                r.Name,
                r.RoomNumber,
                r.Description,
                r.PricePerNight,
                r.MaxOccupancy,
                r.BedCount,
                r.SizeSqm,
                r.IsAvailable,
                r.Inclusions,
                r.Images
            })
            .ToList();

        return Ok(payload);
    }
}
