using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/bookings")]
public sealed class BookingsApiController : ControllerBase
{
    private readonly IBookingService _bookingService;
    private readonly IValidator<CreateBookingRequest> _validator;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;
    private readonly IGuestCatalogNotifier _guestCatalog;
    private readonly ILogger<BookingsApiController> _logger;

    public BookingsApiController(
        IBookingService bookingService,
        IValidator<CreateBookingRequest> validator,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub,
        IGuestCatalogNotifier guestCatalog,
        ILogger<BookingsApiController> logger)
    {
        _bookingService = bookingService;
        _validator = validator;
        _hub = hub;
        _guestCatalog = guestCatalog;
        _logger = logger;
    }

    [HttpGet("availability")]
    public async Task<ActionResult<IReadOnlyList<RoomAvailabilityDto>>> GetAvailability(
        [FromQuery] DateTime checkInAtUtc,
        [FromQuery] DateTime checkoutTimeUtc,
        CancellationToken cancellationToken)
    {
        try
        {
            var availability = await _bookingService.GetAvailabilityAsync(
                checkInAtUtc,
                checkoutTimeUtc,
                cancellationToken);
            return Ok(availability);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Guest availability check failed for {CheckIn} → {Checkout}", checkInAtUtc, checkoutTimeUtc);
            return BadRequest(new { message = "Those dates could not be checked. Please pick valid check-in and check-out dates." });
        }
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-bookings")]
    public async Task<ActionResult<CreateBookingResponse>> Create(
        [FromBody] CreateBookingRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest(new { message = "Booking details are required." });
        }

        var validation = await _validator.ValidateAsync(request, cancellationToken);
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
            var booking = await _bookingService.CreateAsync(request, cancellationToken);
            var notification = new BookingNotificationDto(
                booking.Id,
                booking.Reference,
                booking.GuestName,
                booking.Kind,
                booking.Status,
                booking.CheckInAtUtc,
                booking.CreatedAtUtc,
                false);

            await _hub.Clients.All.BookingCreated(notification);
            await _guestCatalog.NotifyChangedAsync("availability", cancellationToken);

            return StatusCode(
                StatusCodes.Status201Created,
                new CreateBookingResponse(
                    booking.Reference,
                    booking.Kind,
                    booking.PaymentOption,
                    booking.Status,
                    booking.TotalAmount,
                    booking.AmountDueNow,
                    booking.Items));
        }
        catch (BookingAvailabilityException ex)
        {
            return Conflict(new
            {
                message = ex.Message,
                availability = ex.Availability
            });
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogWarning(ex, "Guest booking save failed (database).");
            return Conflict(new
            {
                message = "We could not complete that booking right now. Please try again in a moment."
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected guest booking failure.");
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                message = "Something went wrong while submitting your booking. Please try again."
            });
        }
    }
}
