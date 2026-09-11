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
    public async Task<IReadOnlyList<BookingDto>> AutoCheckoutExpiredBookingsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var activeConfirmedBookings = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b => !b.IsArchived && b.Status == BookingStatus.Confirmed && b.CheckoutTimeUtc <= now)
            .ToListAsync(cancellationToken);

        var autoCheckedOutBookings = new List<BookingDto>();

        foreach (var booking in activeConfirmedBookings)
        {
            booking.Status = BookingStatus.CheckedOut;
            booking.IsArchived = true;
            booking.ArchivedAtUtc = DateTime.UtcNow;
            booking.UpdatedAtUtc = DateTime.UtcNow;

            ReleaseAssignedRooms(booking);
            AuditBooking(
                booking,
                "Booking.AutoCheckout",
                "Automatic checkout after stay end.",
                actorUserId: "system",
                actorDisplayName: "System");
            autoCheckedOutBookings.Add(MapBooking(booking));
        }

        if (autoCheckedOutBookings.Count > 0)
        {
            await _db.SaveChangesAsync(cancellationToken);
        }

        return autoCheckedOutBookings;
    }

    public async Task<IReadOnlyList<BookingDto>> ProcessCheckoutWarningsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var candidates = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Confirmed
                && b.CheckoutWarningSentAtUtc == null
                && b.CheckInAtUtc <= now
                && now >= b.CheckoutTimeUtc.AddMinutes(-20)
                && now < b.CheckoutTimeUtc)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            return Array.Empty<BookingDto>();
        }

        var warned = new List<BookingDto>(candidates.Count);
        foreach (var booking in candidates)
        {
            booking.CheckoutWarningSentAtUtc = now;
            booking.IsNotificationCleared = false;
            booking.UpdatedAtUtc = now;
            warned.Add(MapBooking(booking));
        }

        await _db.SaveChangesAsync(cancellationToken);
        return warned;
    }

    public async Task<IReadOnlyList<BookingDto>> ProcessArrivalWarningsAsync(
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var candidates = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Confirmed
                && b.ArrivalWarningSentAtUtc == null
                && now >= b.CheckInAtUtc.AddMinutes(-20)
                && now < b.CheckInAtUtc)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            return Array.Empty<BookingDto>();
        }

        var warned = new List<BookingDto>(candidates.Count);
        foreach (var booking in candidates)
        {
            booking.ArrivalWarningSentAtUtc = now;
            booking.IsNotificationCleared = false;
            booking.UpdatedAtUtc = now;
            warned.Add(MapBooking(booking));
        }

        await _db.SaveChangesAsync(cancellationToken);
        return warned;
    }

    public async Task<IReadOnlyList<BookingDto>> GetArrivingSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        windowMinutes = Math.Clamp(windowMinutes, 1, 120);
        var now = DateTime.UtcNow;
        var windowEnd = now.AddMinutes(windowMinutes);

        var bookings = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Confirmed
                && b.CheckInAtUtc > now
                && b.CheckInAtUtc <= windowEnd)
            .OrderBy(b => b.CheckInAtUtc)
            .ToListAsync(cancellationToken);

        return bookings.Select(MapBooking).ToList();
    }

    public async Task<IReadOnlyList<BookingDto>> ProcessPendingCallWarningsAsync(
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var candidates = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Pending
                && b.PendingCallWarningSentAtUtc == null
                && now >= b.CheckInAtUtc.AddMinutes(-20)
                && now < b.CheckInAtUtc)
            .ToListAsync(cancellationToken);

        if (candidates.Count == 0)
        {
            return Array.Empty<BookingDto>();
        }

        var warned = new List<BookingDto>(candidates.Count);
        foreach (var booking in candidates)
        {
            booking.PendingCallWarningSentAtUtc = now;
            booking.IsNotificationCleared = false;
            booking.UpdatedAtUtc = now;
            warned.Add(MapBooking(booking));
        }

        await _db.SaveChangesAsync(cancellationToken);
        return warned;
    }

    public async Task<IReadOnlyList<BookingDto>> GetPendingCallsSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        windowMinutes = Math.Clamp(windowMinutes, 1, 120);
        var now = DateTime.UtcNow;
        var windowEnd = now.AddMinutes(windowMinutes);

        var bookings = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Pending
                && b.CheckInAtUtc > now
                && b.CheckInAtUtc <= windowEnd)
            .OrderBy(b => b.CheckInAtUtc)
            .ToListAsync(cancellationToken);

        return bookings.Select(MapBooking).ToList();
    }

    public async Task<IReadOnlyList<BookingDto>> GetCheckoutsSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default)
    {
        windowMinutes = Math.Clamp(windowMinutes, 1, 120);
        var now = DateTime.UtcNow;
        var windowEnd = now.AddMinutes(windowMinutes);

        var bookings = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Confirmed
                && b.CheckInAtUtc <= now
                && b.CheckoutTimeUtc > now
                && b.CheckoutTimeUtc <= windowEnd)
            .OrderBy(b => b.CheckoutTimeUtc)
            .ToListAsync(cancellationToken);

        return bookings.Select(MapBooking).ToList();
    }

    public async Task<DaytimeBookingFlowDto> GetDaytimeBookingFlowAsync(
        int startHour = 6,
        int endHour = 18,
        CancellationToken cancellationToken = default)
    {
        startHour = Math.Clamp(startHour, 0, 23);
        endHour = Math.Clamp(endHour, startHour, 23);

        var localDate = PhilippinesTime.NowManila().Date;
        var localStart = DateTime.SpecifyKind(localDate.AddHours(startHour), DateTimeKind.Unspecified);
        var localEndExclusive = DateTime.SpecifyKind(localDate.AddHours(endHour + 1), DateTimeKind.Unspecified);
        var startUtc = PhilippinesTime.ToUtc(localStart);
        var endUtcExclusive = PhilippinesTime.ToUtc(localEndExclusive);

        var arrivals = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Pending
                && b.CheckInAtUtc >= startUtc
                && b.CheckInAtUtc < endUtcExclusive)
            .OrderBy(b => b.CreatedAtUtc)
            .ThenBy(b => b.CheckInAtUtc)
            .ToListAsync(cancellationToken);

        var checkouts = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Pending
                && b.CheckoutTimeUtc >= startUtc
                && b.CheckoutTimeUtc < endUtcExclusive)
            .OrderBy(b => b.CreatedAtUtc)
            .ThenBy(b => b.CheckoutTimeUtc)
            .ToListAsync(cancellationToken);

        return new DaytimeBookingFlowDto(
            localDate.ToString("yyyy-MM-dd"),
            startHour,
            endHour,
            arrivals.Select(MapBooking).ToList(),
            checkouts.Select(MapBooking).ToList());
    }

    public async Task<IReadOnlyList<BookingDto>> AutoCancelExpiredPendingAsync(
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        // Past scheduled check-in only â€” never cancel before arrival time.
        var candidates = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Pending
                && b.CheckInAtUtc <= now)
            .ToListAsync(cancellationToken);

        var expired = candidates
            .Where(b => PendingUnverifiedDeadlineUtc(b) <= now)
            .ToList();

        if (expired.Count == 0)
        {
            return Array.Empty<BookingDto>();
        }

        var cancelled = new List<BookingDto>(expired.Count);
        foreach (var booking in expired)
        {
            booking.Status = BookingStatus.Cancelled;
            booking.IsArchived = true;
            booking.ArchivedAtUtc = now;
            booking.IsNotificationCleared = false;
            booking.UpdatedAtUtc = now;
            ReleaseAssignedRooms(booking);
            AuditBooking(
                booking,
                "Booking.AutoCancel",
                "Pending stay auto-cancelled after unverified grace.",
                actorUserId: "system",
                actorDisplayName: "System");
            cancelled.Add(MapBooking(booking));
        }

        await _db.SaveChangesAsync(cancellationToken);
        return cancelled;
    }

    /// <summary>
    /// Auto-cancel deadline for an unverified pending booking.
    /// </summary>
    private static DateTime PendingUnverifiedDeadlineUtc(Booking booking)
    {
        // Late same-day book (created after scheduled check-in): grace from booking time.
        var graceStart = booking.CreatedAtUtc > booking.CheckInAtUtc
            ? booking.CreatedAtUtc
            : booking.CheckInAtUtc;
        return graceStart.Add(PendingUnverifiedGrace);
    }
}
