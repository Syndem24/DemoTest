using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/bookings")]
public sealed class AdminBookingsApiController : ControllerBase
{
    private readonly IBookingService _bookingService;
    private readonly IValidator<UpdateBookingRequest> _updateValidator;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;

    public AdminBookingsApiController(
        IBookingService bookingService,
        IValidator<UpdateBookingRequest> updateValidator,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _bookingService = bookingService;
        _updateValidator = updateValidator;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<PagedBookingsDto>> GetBookings(
        [FromQuery] BookingStatus? status,
        [FromQuery] string? search,
        [FromQuery] bool history = false,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _bookingService.GetPagedAsync(
            status,
            search,
            history,
            page,
            pageSize,
            cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BookingDto>> GetBooking(
        int id,
        CancellationToken cancellationToken)
    {
        var booking = await _bookingService.GetByIdAsync(id, cancellationToken);
        return booking == null ? NotFound() : Ok(booking);
    }

    [HttpGet("calendar")]
    public async Task<ActionResult<IReadOnlyList<ReservationCalendarEventDto>>> GetCalendar(
        [FromQuery] DateOnly start,
        [FromQuery] DateOnly end,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _bookingService.GetReservationCalendarAsync(
                start,
                end,
                cancellationToken));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("notifications")]
    public async Task<IActionResult> GetNotifications(
        [FromQuery] int limit = 10,
        CancellationToken cancellationToken = default)
    {
        var items = await _bookingService.GetRecentNotificationsAsync(limit, cancellationToken);
        var unread = await _bookingService.GetUnreadCountAsync(cancellationToken);
        return Ok(new { unread, items });
    }

    [HttpPost("{id:int}/read")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> MarkRead(
        int id,
        CancellationToken cancellationToken)
    {
        var booking = await _bookingService.MarkReadAsync(id, cancellationToken);
        if (booking == null)
        {
            return NotFound();
        }

        await _hub.Clients.All.BookingUpdated(ToNotification(booking));
        return Ok(booking);
    }

    [HttpGet("{id:int}/assignable-rooms")]
    public async Task<ActionResult<IReadOnlyList<AssignableRoomsByTypeDto>>> GetAssignableRooms(
        int id,
        CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await _bookingService.GetAssignableRoomsAsync(id, cancellationToken));
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/status")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> UpdateStatus(
        int id,
        [FromBody] UpdateBookingStatusRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var booking = await _bookingService.UpdateStatusAsync(
                id,
                request.Status,
                request.RowVersion,
                request.Assignments,
                cancellationToken);
            await _hub.Clients.All.BookingUpdated(ToNotification(booking));
            return Ok(booking);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (BookingAvailabilityException ex)
        {
            return Conflict(new { message = ex.Message, availability = ex.Availability });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPut("{id:int}")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> Update(
        int id,
        [FromBody] UpdateBookingRequest request,
        CancellationToken cancellationToken)
    {
        var validation = await _updateValidator.ValidateAsync(request, cancellationToken);
        if (!validation.IsValid)
        {
            return ValidationProblem(new ValidationProblemDetails(
                validation.Errors
                    .GroupBy(error => error.PropertyName)
                    .ToDictionary(
                        group => group.Key,
                        group => group.Select(error => error.ErrorMessage).Distinct().ToArray())));
        }

        try
        {
            var booking = await _bookingService.UpdateAsync(id, request, cancellationToken);
            await _hub.Clients.All.BookingUpdated(ToNotification(booking));
            return Ok(booking);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (BookingAvailabilityException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/checkout")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> Checkout(
        int id,
        [FromBody] BookingVersionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var booking = await _bookingService.CheckoutAsync(
                id,
                request.RowVersion,
                cancellationToken);
            await _hub.Clients.All.BookingArchived(id);
            return Ok(booking);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/cancel")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> Cancel(
        int id,
        [FromBody] BookingVersionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var booking = await _bookingService.CancelAsync(
                id,
                request.RowVersion,
                cancellationToken);
            await _hub.Clients.All.BookingArchived(id);
            return Ok(booking);
        }
        catch (KeyNotFoundException)
        {
            return NotFound();
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    private static BookingNotificationDto ToNotification(BookingDto booking)
    {
        return new BookingNotificationDto(
            booking.Id,
            booking.Reference,
            booking.GuestName,
            booking.Kind,
            booking.Status,
            booking.CheckIn,
            booking.CreatedAtUtc,
            booking.AdminReadAtUtc != null);
    }
}
