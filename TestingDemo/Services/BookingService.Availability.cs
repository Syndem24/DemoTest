using System.Data;
using System.Globalization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed partial class BookingService
{
    public async Task<IReadOnlyList<RoomAvailabilityDto>> GetAvailabilityAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        CancellationToken cancellationToken = default)
    {
        return await BuildAvailabilityAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: null,
            allowPastCheckIn: false,
            cancellationToken);
    }

    public async Task<IReadOnlyList<RoomAvailabilityDto>> GetAvailabilityForBookingAsync(
        int bookingId,
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        CancellationToken cancellationToken = default)
    {
        var exists = await _db.Bookings.AsNoTracking()
            .AnyAsync(b => b.Id == bookingId, cancellationToken);
        if (!exists)
        {
            throw new KeyNotFoundException("Booking was not found.");
        }

        return await BuildAvailabilityAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: bookingId,
            allowPastCheckIn: true,
            cancellationToken);
    }

    private async Task<IReadOnlyList<RoomAvailabilityDto>> BuildAvailabilityAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        bool allowPastCheckIn,
        CancellationToken cancellationToken)
    {
        checkInAtUtc = PhilippinesTime.ToUtc(checkInAtUtc);
        checkoutTimeUtc = PhilippinesTime.ToUtc(checkoutTimeUtc);
        ValidateDates(checkInAtUtc, checkoutTimeUtc, allowPastCheckIn);

        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var nights = EnumerateStayNights(checkInAtUtc, checkoutTimeUtc);
        var overlapping = await LoadOverlappingBookingLinesAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);
        var (maxHeld, soldOutByType) = ComputeNightlyInventory(
            capacities,
            overlapping,
            nights);

        return capacities
            .Select(item =>
            {
                var used = maxHeld.GetValueOrDefault(item.RoomTypeId);
                var soldOut = soldOutByType.GetValueOrDefault(item.RoomTypeId) ?? [];
                return new RoomAvailabilityDto(
                    item.RoomTypeId,
                    item.RoomTypeName,
                    item.Capacity,
                    Math.Max(0, item.Capacity - used),
                    item.PricePerNight,
                    soldOut);
            })
            .OrderBy(item => item.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
