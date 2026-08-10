using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
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

    public BookingsApiController(
        IBookingService bookingService,
        IValidator<CreateBookingRequest> validator,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _bookingService = bookingService;
        _validator = validator;
        _hub = hub;
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
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("guest-bookings")]
    public async Task<ActionResult<CreateBookingResponse>> Create(
        [FromBody] CreateBookingRequest request,
        CancellationToken cancellationToken)
    {
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
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
