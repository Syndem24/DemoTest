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
    private readonly IValidator<CreateWalkInRequest> _walkInValidator;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;

    public AdminBookingsApiController(
        IBookingService bookingService,
        IValidator<UpdateBookingRequest> updateValidator,
        IValidator<CreateWalkInRequest> walkInValidator,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _bookingService = bookingService;
        _updateValidator = updateValidator;
        _walkInValidator = walkInValidator;
        _hub = hub;
    }

    [HttpPost("walk-in")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> CreateWalkIn(
        [FromBody] CreateWalkInRequest request,
        CancellationToken cancellationToken)
    {
        var validation = await _walkInValidator.ValidateAsync(request, cancellationToken);
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
            var booking = await _bookingService.CreateWalkInAsync(request, cancellationToken);
            await _hub.Clients.All.BookingCreated(new BookingNotificationDto(
                booking.Id,
                booking.Reference,
                booking.GuestName,
                booking.Kind,
                booking.Status,
                booking.CheckInAtUtc,
                booking.CreatedAtUtc,
                false,
                "Walk-in confirmed with room assignment"));
            return Ok(booking);
        }
        catch (BookingAvailabilityException ex)
        {
            return Conflict(new { message = ex.Message, availability = ex.Availability });
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
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
        [FromQuery] DateTime start,
        [FromQuery] DateTime end,
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

    [HttpPost("notifications/read-all")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> MarkAllRead(CancellationToken cancellationToken)
    {
        await _bookingService.MarkAllAsReadAsync(cancellationToken);
        return Ok(new { success = true });
    }

    [HttpPost("process-auto-checkout")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ProcessAutoCheckout(CancellationToken cancellationToken)
    {
        var pendingCalls = await _bookingService.ProcessPendingCallWarningsAsync(cancellationToken);
        var arrivals = await _bookingService.ProcessArrivalWarningsAsync(cancellationToken);
        var warnings = await _bookingService.ProcessCheckoutWarningsAsync(cancellationToken);
        var autoCancelled = await _bookingService.AutoCancelExpiredPendingAsync(cancellationToken);
        var autoCheckouts = await _bookingService.AutoCheckoutExpiredBookingsAsync(cancellationToken);

        foreach (var booking in pendingCalls)
        {
            await _hub.Clients.All.BookingUpdated(ToNotification(
                booking,
                "Call guest: verify pending booking (20 mins)"));
        }

        foreach (var booking in arrivals)
        {
            await _hub.Clients.All.BookingUpdated(ToNotification(
                booking,
                "Arrival in 20 mins: guest checking in soon"));
        }

        foreach (var booking in warnings)
        {
            await _hub.Clients.All.BookingUpdated(ToNotification(
                booking,
                "Call guest: checkout in 20 mins — ask about late checkout"));
        }

        foreach (var booking in autoCancelled)
        {
            await _hub.Clients.All.BookingUpdated(ToNotification(
                booking,
                "Pending booking auto-cancelled (unverified after 4-hour grace)"));
            await _hub.Clients.All.BookingArchived(booking.Id);
        }

        foreach (var booking in autoCheckouts)
        {
            await _hub.Clients.All.BookingUpdated(ToNotification(
                booking,
                "Auto-Checkout Completed: Client duration done"));
        }

        return Ok(new
        {
            pendingCallsSent = pendingCalls.Count,
            arrivalsSent = arrivals.Count,
            warningsSent = warnings.Count,
            autoCancelled = autoCancelled.Count,
            autoCheckedOut = autoCheckouts.Count
        });
    }

    [HttpGet("arrivals")]
    public async Task<ActionResult<IReadOnlyList<BookingDto>>> GetArrivals(
        [FromQuery] int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _bookingService.GetArrivingSoonAsync(windowMinutes, cancellationToken));
    }

    [HttpGet("pending-calls")]
    public async Task<ActionResult<IReadOnlyList<BookingDto>>> GetPendingCalls(
        [FromQuery] int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _bookingService.GetPendingCallsSoonAsync(windowMinutes, cancellationToken));
    }

    [HttpGet("checkouts")]
    public async Task<ActionResult<IReadOnlyList<BookingDto>>> GetCheckouts(
        [FromQuery] int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _bookingService.GetCheckoutsSoonAsync(windowMinutes, cancellationToken));
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
                request.Assignments,
                cancellationToken);

            string? message = null;
            var now = DateTime.UtcNow;
            if (booking.Status == BookingStatus.Confirmed
                && now >= booking.CheckInAtUtc.AddMinutes(-20)
                && now < booking.CheckInAtUtc)
            {
                message = "Arrival in 20 mins: guest checking in soon";
            }

            await _hub.Clients.All.BookingUpdated(ToNotification(booking, message));
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

    [HttpPost("{id:int}/assign-rooms")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> AssignRooms(
        int id,
        [FromBody] UpdateBookingStatusRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var booking = await _bookingService.AssignRoomsAsync(
                id,
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

    [HttpPut("{id:int}/charges")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> UpdateCharges(
        int id,
        [FromBody] UpdateBookingChargesRequest request,
        CancellationToken cancellationToken)
    {
        if (request.LateCheckoutHours is < 0 or > 3)
        {
            return BadRequest(new { message = "Late check-out is limited to 0–3 hours." });
        }

        if (request.ExtraPersons is < 0 or > 1)
        {
            return BadRequest(new { message = "Extra person is limited to one on a single room." });
        }

        try
        {
            var booking = await _bookingService.UpdateChargesAsync(id, request, cancellationToken);
            // Quiet refresh for open details / totals — do not resurface notification bell.
            await _hub.Clients.All.PaymentChanged(booking.Id);
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

    [HttpGet("history/flush-logs")]
    public async Task<ActionResult<IReadOnlyList<BookingHistoryFlushLogDto>>> GetHistoryFlushLogs(
        CancellationToken cancellationToken)
    {
        return Ok(await _bookingService.GetHistoryFlushLogsAsync(cancellationToken));
    }

    [HttpPost("history/flush")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> FlushHistory(
        [FromBody] FlushBookingHistoryRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _bookingService.FlushHistoryAsync(
                request.PerformedBy,
                cancellationToken);
            Response.Headers["X-Flush-Record-Count"] = result.Log.RecordCount.ToString();
            Response.Headers["X-Flush-Performed-By"] = result.Log.PerformedBy;
            Response.Headers.Append("Access-Control-Expose-Headers", "Content-Disposition, X-Flush-Record-Count, X-Flush-Performed-By");
            return File(result.PdfBytes, "application/pdf", result.FileName);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    private static BookingNotificationDto ToNotification(BookingDto booking, string? message = null)
    {
        return new BookingNotificationDto(
            booking.Id,
            booking.Reference,
            booking.GuestName,
            booking.Kind,
            booking.Status,
            booking.CheckInAtUtc,
            booking.CreatedAtUtc,
            false,
            message);
    }
}
