using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/special-offers")]
public sealed class SpecialOffersApiController : ControllerBase
{
    private readonly ISpecialOfferService _offers;
    private readonly HotelBookingDbContext _db;

    public SpecialOffersApiController(ISpecialOfferService offers, HotelBookingDbContext db)
    {
        _offers = offers;
        _db = db;
    }

    /// <summary>Active offers for guest accommodations (online-visible only).</summary>
    [HttpGet("active")]
    [AllowAnonymous]
    public async Task<IActionResult> GetActive(
        [FromQuery] int? roomTypeId,
        CancellationToken cancellationToken)
    {
        var list = (await _offers.GetActiveForGuestAsync(roomTypeId, cancellationToken)).ToList();
        if (User.IsInRole(AppRoles.Guest))
        {
            var email = (User.FindFirstValue(ClaimTypes.Email) ?? string.Empty).Trim();
            if (email.Length > 0)
            {
                var prior = await _db.Bookings.AsNoTracking().AnyAsync(
                    b => b.Channel == BookingChannel.Online
                        && b.Status != BookingStatus.Cancelled
                        && b.GuestEmail == email,
                    cancellationToken);
                if (prior)
                {
                    list = list
                        .Where(o => o.Kind != SpecialOfferKind.GoogleLoyalty
                            || o.LoyaltyApplyMode != LoyaltyApplyMode.FirstBooking)
                        .ToList();
                }
            }
        }

        return Ok(list);
    }

    /// <summary>Active Limited Time / Stay Longer offers for walk-in / front desk (WalkIn channel).</summary>
    [HttpGet("active-walk-in")]
    [Authorize(Roles = "AdminManager,Receptionist")]
    public async Task<IActionResult> GetActiveWalkIn(
        [FromQuery] int? roomTypeId,
        CancellationToken cancellationToken)
    {
        var list = await _offers.GetActiveForWalkInAsync(roomTypeId, cancellationToken);
        return Ok(list);
    }

    /// <summary>Deactivate an offer (and siblings with the same campaign window).</summary>
    [HttpPost("{id:int}/deactivate")]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Deactivate(int id, CancellationToken cancellationToken)
    {
        var ok = await _offers.DeactivateAsync(id, cancellationToken);
        if (!ok) return NotFound(new { message = "Offer was not found." });
        return Ok(new { message = "Offer deactivated." });
    }

    /// <summary>Reactivate a deactivated offer with a new Manila start/end window.</summary>
    [HttpPost("{id:int}/reactivate")]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Reactivate(
        int id,
        [FromBody] ReactivateSpecialOfferRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var updated = await _offers.ReactivateAsync(id, request, cancellationToken);
            if (updated is null) return NotFound(new { message = "Offer was not found." });
            return Ok(new { message = "Offer reactivated.", offer = updated });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>Hard-delete an offer and its sibling room-type rows. Bookings keep promo history (FK SetNull).</summary>
    [HttpDelete("{id:int}")]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var ok = await _offers.DeleteAsync(id, cancellationToken);
        if (!ok) return NotFound(new { message = "Offer was not found." });
        return Ok(new { message = "Offer deleted." });
    }

    [HttpGet]
    [Authorize(Roles = "AdminManager,Receptionist")]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        if (!User.IsInRole(AppRoles.AdminManager))
            return Ok(await _offers.GetCurrentAsync(cancellationToken));
        return Ok(await _offers.GetAllAsync(cancellationToken));
    }
}
