using FluentValidation;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/guest/bookings")]
[Authorize(Roles = AppRoles.Guest)]
public sealed class GuestBookingsApiController : ControllerBase
{
    private readonly IBookingService _bookingService;
    private readonly IValidator<UpdateBookingRequest> _updateValidator;
    private readonly UserManager<ApplicationUser> _users;
    private readonly HotelBookingDbContext _db;
    private readonly ILogger<GuestBookingsApiController> _logger;

    public GuestBookingsApiController(
        IBookingService bookingService,
        IValidator<UpdateBookingRequest> updateValidator,
        UserManager<ApplicationUser> users,
        HotelBookingDbContext db,
        ILogger<GuestBookingsApiController> logger)
    {
        _bookingService = bookingService;
        _updateValidator = updateValidator;
        _users = users;
        _db = db;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BookingDto>>> GetAll(CancellationToken cancellationToken)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        return Ok(await _bookingService.GetGuestBookingsAsync(user.Email, user.GoogleEmail, cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BookingDto>> GetById(int id, CancellationToken cancellationToken)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        var emails = GuestBookingEmailSet.Build(user.Email, user.GoogleEmail);
        var booking = await _bookingService.GetByIdAsync(id, cancellationToken);
        if (booking is null || !GuestBookingEmailSet.Matches(booking.GuestEmail, emails))
        {
            return NotFound(new { message = "Booking was not found." });
        }

        var paidTotal = await GetPaidTotalAsync(id, cancellationToken);
        return Ok(booking with { PaidTotal = paidTotal });
    }

    [HttpPut("{id:int}")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<BookingDto>> Update(
        int id,
        [FromBody] UpdateBookingRequest request,
        CancellationToken cancellationToken)
    {
        var user = await _users.GetUserAsync(User);
        if (user is null) return Unauthorized();

        var emails = GuestBookingEmailSet.Build(user.Email, user.GoogleEmail);
        var booking = await _db.Bookings
            .AsSplitQuery()
            .Include(b => b.PaymentRecords)
            .FirstOrDefaultAsync(b => b.Id == id, cancellationToken);

        if (booking is null || !GuestBookingEmailSet.Matches(booking.GuestEmail, emails))
        {
            return NotFound(new { message = "Booking was not found." });
        }

        var paidTotal = booking.PaymentRecords
            .Where(p => p.Status == PaymentRecordStatus.Posted)
            .Sum(p => p.Amount);

        if (paidTotal >= booking.TotalAmount - 0.009m)
        {
            return Conflict(new
            {
                message = "This booking is fully paid. If you want to change this booking, please contact the receptionist."
            });
        }

        if (booking.IsArchived || booking.Status is not BookingStatus.Pending and not BookingStatus.Confirmed)
        {
            return Conflict(new
            {
                message = "This booking cannot be edited online. If you want to change this booking, please contact the receptionist."
            });
        }

        request.PaymentOption = booking.PaymentOption;

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
            var updated = await _bookingService.UpdateAsync(id, request, cancellationToken, editedByGuest: true);
            var updatedPaidTotal = await GetPaidTotalAsync(id, cancellationToken);
            return Ok(updated with { PaidTotal = updatedPaidTotal });
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
        catch (BookingConcurrencyException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (BookingAvailabilityException ex)
        {
            return Conflict(new
            {
                message = ex.Message,
                availability = ex.Availability
            });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Guest booking update failed for booking {BookingId} by user {UserId}", id, user.Id);
            return StatusCode(StatusCodes.Status500InternalServerError, new { message = "Unable to update the booking. Please try again later." });
        }
    }

    private async Task<decimal> GetPaidTotalAsync(int bookingId, CancellationToken cancellationToken)
    {
        return await _db.PaymentRecords
            .AsNoTracking()
            .Where(p => p.BookingId == bookingId && p.Status == PaymentRecordStatus.Posted)
            .SumAsync(p => p.Amount, cancellationToken);
    }
}
