using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/rooms")]
public class RoomsApiController : ControllerBase
{
    private readonly IRoomService _roomService;
    private readonly IBookingService _bookingService;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;

    public RoomsApiController(
        IRoomService roomService,
        IBookingService bookingService,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _roomService = roomService;
        _bookingService = bookingService;
        _hub = hub;
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
        var occupiedIds = rooms
            .Where(room => room.Status == RoomStatus.Occupied)
            .Select(room => room.Id)
            .ToList();
        var stays = await _bookingService.GetActiveStaysByRoomIdsAsync(occupiedIds, cancellationToken);

        var payload = rooms
            .OrderBy(r => r.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase)
            .Select(r =>
            {
                stays.TryGetValue(r.Id, out var stay);
                return new
                {
                    r.Id,
                    r.RoomTypeId,
                    r.Name,
                    r.RoomNumber,
                    r.Description,
                    r.PricePerNight,
                    r.MaxOccupancy,
                    r.BedCount,
                    Status = r.Status.ToString(),
                    r.Inclusions,
                    r.Images,
                    CurrentGuestName = stay?.GuestName,
                    CurrentBookingReference = stay?.Reference,
                    CurrentBookingId = stay?.Id
                };
            })
            .ToList();

        return Ok(payload);
    }

    [HttpGet("{id:int}/current-stay")]
    public async Task<ActionResult<BookingDto>> GetCurrentStay(
        int id,
        CancellationToken cancellationToken)
    {
        var room = await _roomService.GetByIdAsync(id, cancellationToken);
        if (room is null)
        {
            return NotFound(new { message = "Room was not found." });
        }

        var stay = await _bookingService.GetActiveStayByRoomIdAsync(id, cancellationToken);
        if (stay is null)
        {
            return NotFound(new { message = "No confirmed guest stay is assigned to this room." });
        }

        return Ok(stay);
    }

    [HttpPost("{id:int}/checkout")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> Checkout(
        int id,
        [FromBody] BookingVersionRequest request,
        CancellationToken cancellationToken)
    {
        var stay = await _bookingService.GetActiveStayByRoomIdAsync(id, cancellationToken);
        if (stay is null)
        {
            return NotFound(new { message = "No confirmed guest stay is assigned to this room." });
        }

        try
        {
            var booking = await _bookingService.CheckoutAsync(
                stay.Id,
                cancellationToken);
            await _hub.Clients.All.BookingArchived(booking.Id);
            return Ok(booking);
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }
}
