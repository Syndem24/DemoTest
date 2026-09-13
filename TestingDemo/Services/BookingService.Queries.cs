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
    public async Task<PagedBookingsDto> GetPagedAsync(
        BookingStatus? status,
        string? search,
        bool history,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.Bookings
            .AsNoTracking()
            .Where(booking => booking.IsArchived == history)
            .AsQueryable();

        if (status.HasValue)
        {
            query = query.Where(booking => booking.Status == status.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(booking =>
                booking.Reference.Contains(term)
                || booking.GuestName.Contains(term)
                || booking.GuestEmail.Contains(term)
                || booking.GuestPhone.Contains(term));
        }

        try
        {
            var total = await query.CountAsync(cancellationToken);
            if (total == 0)
            {
                return new PagedBookingsDto(new List<BookingDto>(), page, pageSize, 0);
            }

            var pageBookingIds = await query
                .OrderByDescending(booking => booking.CreatedAtUtc)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(booking => booking.Id)
                .ToListAsync(cancellationToken);

            if (pageBookingIds.Count == 0)
            {
                return new PagedBookingsDto(new List<BookingDto>(), page, pageSize, total);
            }

            var indexById = pageBookingIds
                .Select((id, index) => new { id, index })
                .ToDictionary(item => item.id, item => item.index);

            var bookings = await _db.Bookings
                .AsNoTracking()
                .AsSplitQuery()
                .Include(booking => booking.Items)
                    .ThenInclude(line => line.RoomType)
                .Include(booking => booking.Items)
                    .ThenInclude(line => line.RoomAssignments)
                        .ThenInclude(assignment => assignment.Room)
                .Include(booking => booking.Charges)
                .Include(booking => booking.SpecialOffer)
                .Where(booking => pageBookingIds.Contains(booking.Id))
                .ToListAsync(cancellationToken);

            var mapped = bookings
                .OrderBy(booking => indexById[booking.Id])
                .Select(MapBooking)
                .ToList();

            var inventoryFlags = await ComputeExceedsInventoryFlagsAsync(bookings, cancellationToken);
            if (inventoryFlags.Count > 0)
            {
                mapped = mapped
                    .Select(dto => dto with
                    {
                        ExceedsAvailableInventory = inventoryFlags.GetValueOrDefault(dto.Id)
                    })
                    .ToList();
            }

            return new PagedBookingsDto(mapped, page, pageSize, total);
        }
        catch (SqlException ex) when (cancellationToken.IsCancellationRequested
            || ex.Message.Contains("Operation cancelled by user", StringComparison.OrdinalIgnoreCase))
        {
            throw new OperationCanceledException("Booking list query was cancelled.", ex, cancellationToken);
        }
    }

    public async Task<BookingDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .Include(item => item.SpecialOffer)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return booking == null ? null : MapBooking(booking);
    }

    public async Task<BookingDto?> GetActiveStayByRoomIdAsync(
        int roomId,
        CancellationToken cancellationToken = default)
    {
        var bookingId = await _db.BookingRoomAssignments
            .AsNoTracking()
            .Where(assignment =>
                assignment.RoomId == roomId
                && !assignment.BookingItem.Booking.IsArchived
                && assignment.BookingItem.Booking.Status == BookingStatus.Confirmed)
            .Select(assignment => assignment.BookingItem.BookingId)
            .FirstOrDefaultAsync(cancellationToken);

        return bookingId == 0
            ? null
            : await GetByIdAsync(bookingId, cancellationToken);
    }

    public async Task<IReadOnlyDictionary<int, BookingDto>> GetActiveStaysByRoomIdsAsync(
        IEnumerable<int> roomIds,
        CancellationToken cancellationToken = default)
    {
        var ids = roomIds.Where(id => id > 0).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<int, BookingDto>();
        }

        var bookingIdsByRoom = await _db.BookingRoomAssignments
            .AsNoTracking()
            .Where(assignment =>
                ids.Contains(assignment.RoomId)
                && !assignment.BookingItem.Booking.IsArchived
                && assignment.BookingItem.Booking.Status == BookingStatus.Confirmed)
            .Select(assignment => new
            {
                assignment.RoomId,
                assignment.BookingItem.BookingId
            })
            .ToListAsync(cancellationToken);

        if (bookingIdsByRoom.Count == 0)
        {
            return new Dictionary<int, BookingDto>();
        }

        var bookingIds = bookingIdsByRoom.Select(item => item.BookingId).Distinct().ToList();
        var bookings = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(booking => bookingIds.Contains(booking.Id))
            .ToListAsync(cancellationToken);

        var mapped = bookings.ToDictionary(booking => booking.Id, MapBooking);
        var result = new Dictionary<int, BookingDto>();
        foreach (var link in bookingIdsByRoom)
        {
            if (mapped.TryGetValue(link.BookingId, out var booking))
            {
                result[link.RoomId] = booking;
            }
        }

        return result;
    }

    public async Task<ReservationCalendarDto> GetReservationCalendarAsync(
        DateTime start,
        DateTime end,
        CancellationToken cancellationToken = default)
    {
        if (end <= start || (end - start).TotalDays > 370)
        {
            throw new ArgumentException("Choose a calendar range of one year or less.");
        }

        start = PhilippinesTime.ToUtc(start);
        end = PhilippinesTime.ToUtc(end);

        var stays = await _db.Bookings
            .AsNoTracking()
            .Include(booking => booking.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Include(booking => booking.Charges)
            .Where(booking =>
                !booking.IsArchived
                && booking.Status == BookingStatus.Confirmed
                && booking.CheckInAtUtc < end
                && booking.CheckoutTimeUtc > start)
            .OrderBy(booking => booking.CheckInAtUtc)
            .ThenBy(booking => booking.GuestName)
            .ToListAsync(cancellationToken);

        var events = stays
            .Select(booking =>
            {
                var kindLabel = booking.Kind == BookingKind.Reservation
                    ? "Reservation"
                    : "Booking";
                var extensionNights = (booking.Charges ?? Array.Empty<BookingCharge>())
                    .Where(charge => charge.ChargeType == BookingChargeType.StayExtension)
                    .Sum(charge => Math.Max(0, charge.Quantity));
                var totalNights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
                // Keep at least one primary night so the original stay remains visible.
                extensionNights = Math.Clamp(extensionNights, 0, Math.Max(0, totalNights - 1));

                var requestedRooms = 0;
                var assignedRooms = 0;
                foreach (var line in booking.Items)
                {
                    var requested = Math.Max(0, line.Quantity);
                    var assigned = Math.Min(requested, AssignedRoomCount(line));
                    requestedRooms += requested;
                    assignedRooms += assigned;
                }

                return new ReservationCalendarEventDto(
                    booking.Id,
                    $"{kindLabel} Â· {booking.Reference} Â· {booking.GuestName}",
                    booking.CheckInAtUtc,
                    booking.CheckoutTimeUtc,
                    booking.Reference,
                    booking.GuestName,
                    booking.Kind,
                    booking.PaymentOption,
                    booking.Status,
                    booking.TotalAmount,
                    booking.AmountDueNow,
                    string.Join(", ", booking.Items.Select(line =>
                    {
                        var assigned = (line.RoomAssignments ?? Array.Empty<BookingRoomAssignment>())
                            .Select(assignment => assignment.Room?.RoomNumber)
                            .Where(number => !string.IsNullOrWhiteSpace(number))
                            .ToList();
                        return assigned.Count > 0
                            ? $"{line.RoomTypeName}: {string.Join(", ", assigned)}"
                            : $"{line.Quantity}Ã— {line.RoomTypeName}";
                    })),
                    extensionNights,
                    requestedRooms,
                    assignedRooms);
            })
            .ToList();

        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var maintenanceByType = await GetMaintenanceCountByTypeAsync(cancellationToken);

        return new ReservationCalendarDto(
            events,
            BuildDailyOccupancy(stays, start, end, capacities, maintenanceByType));
    }

    /// <summary>
    /// Reserved = confirmed rooms not yet assigned a door.
    /// Occupied = confirmed rooms with an assignment.
    /// Available = sellable rooms that are not occupied.
    /// Pending stays stay off this calendar until reception confirms.
    /// Checkout day is open: hotel nights are [check-in date, checkout date).
    /// </summary>
    private static IReadOnlyList<DayRoomOccupancyDto> BuildDailyOccupancy(
        IReadOnlyList<Booking> stays,
        DateTime rangeStart,
        DateTime rangeEnd,
        IReadOnlyList<RoomTypeCapacity> capacities,
        IReadOnlyDictionary<int, int> maintenanceByType)
    {
        var startUtc = PhilippinesTime.ToUtc(rangeStart);
        var endUtc = PhilippinesTime.ToUtc(rangeEnd);
        var cursor = PhilippinesTime.ToManila(startUtc).Date;
        var last = PhilippinesTime.ToManila(endUtc).Date;
        if (last <= cursor)
        {
            last = cursor.AddDays(1);
        }

        var holders = new List<(DateTime CheckInDate, DateTime CheckoutDate, int RoomTypeId, int Reserved, int Occupied)>();
        foreach (var booking in stays.Where(item => item.Status == BookingStatus.Confirmed))
        {
            var checkInDate = PhilippinesTime.ToManila(booking.CheckInAtUtc).Date;
            var checkoutDate = PhilippinesTime.ToManila(booking.CheckoutTimeUtc).Date;
            if (checkoutDate <= checkInDate)
            {
                checkoutDate = checkInDate.AddDays(1);
            }

            foreach (var line in booking.Items)
            {
                if (line.RoomTypeId is not int roomTypeId || line.Quantity <= 0)
                {
                    continue;
                }

                var requested = line.Quantity;
                var occupied = Math.Min(requested, AssignedRoomCount(line));
                holders.Add((checkInDate, checkoutDate, roomTypeId, requested - occupied, occupied));
            }
        }

        var capacityTotal = capacities.Sum(item => item.Capacity);
        var days = new List<DayRoomOccupancyDto>();
        var guard = 0;
        while (cursor < last && guard++ < 400)
        {
            var reservedByType = new Dictionary<int, int>();
            var occupiedByType = new Dictionary<int, int>();
            foreach (var hold in holders)
            {
                if (cursor < hold.CheckInDate || cursor >= hold.CheckoutDate)
                {
                    continue;
                }

                reservedByType[hold.RoomTypeId] =
                    reservedByType.GetValueOrDefault(hold.RoomTypeId) + hold.Reserved;
                occupiedByType[hold.RoomTypeId] =
                    occupiedByType.GetValueOrDefault(hold.RoomTypeId) + hold.Occupied;
            }

            var types = capacities
                .Select(item =>
                {
                    reservedByType.TryGetValue(item.RoomTypeId, out var reserved);
                    occupiedByType.TryGetValue(item.RoomTypeId, out var occupied);
                    var maintenance = maintenanceByType.GetValueOrDefault(item.RoomTypeId);
                    return new DayRoomTypeOccupancyDto(
                        item.RoomTypeName,
                        reserved,
                        occupied,
                        Math.Max(0, item.Capacity - maintenance - occupied),
                        item.Capacity);
                })
                .OrderBy(item => item.RoomTypeName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var occupiedTotal = occupiedByType.Values.Sum();
            var reservedTotal = reservedByType.Values.Sum();
            var maintenanceTotal = maintenanceByType.Values.Sum();
            days.Add(new DayRoomOccupancyDto(
                cursor.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                reservedTotal,
                occupiedTotal,
                Math.Max(0, capacityTotal - maintenanceTotal - occupiedTotal),
                capacityTotal,
                types));
            cursor = cursor.AddDays(1);
        }

        return days;
    }

    private static int AssignedRoomCount(BookingItem line)
    {
        return (line.RoomAssignments ?? Array.Empty<BookingRoomAssignment>())
            .Count(assignment => assignment.RoomId > 0);
    }

    public async Task<IReadOnlyList<BookingNotificationDto>> GetRecentNotificationsAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 50);
        var bookings = await _db.Bookings
            .AsNoTracking()
            .AsSplitQuery()
            .Include(b => b.Items)
                .ThenInclude(i => i.RoomAssignments)
                    .ThenInclude(a => a.Room)
            .Where(booking =>
                !booking.IsNotificationCleared
                && (!booking.IsArchived
                    || booking.Status == BookingStatus.Cancelled))
            .OrderByDescending(booking => booking.UpdatedAtUtc)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return bookings.Select(booking =>
        {
            string? message = null;
            var roomNumbers = booking.Items
                .SelectMany(i => i.RoomAssignments)
                .Select(a => a.Room?.RoomNumber)
                .Where(num => !string.IsNullOrWhiteSpace(num))
                .ToList();
            var roomStr = roomNumbers.Count > 0 ? $" (Room {string.Join(", ", roomNumbers)})" : "";
            var now = DateTime.UtcNow;

            if (booking.Status == BookingStatus.Pending
                && now >= booking.CheckInAtUtc.AddMinutes(-20)
                && now < booking.CheckInAtUtc)
            {
                message = "Call guest: verify pending booking (20 mins)";
            }
            else if (booking.Status == BookingStatus.Confirmed
                && now >= booking.CheckInAtUtc.AddMinutes(-20)
                && now < booking.CheckInAtUtc)
            {
                message = $"Arrival in 20 mins: guest checking in soon{roomStr}";
            }
            else if (booking.Status == BookingStatus.Confirmed
                && now >= booking.CheckoutTimeUtc.AddMinutes(-20)
                && now < booking.CheckoutTimeUtc)
            {
                message = $"Call guest: checkout in 20 mins â€” ask about late checkout{roomStr}";
            }
            else if (booking.Status == BookingStatus.CheckedOut)
            {
                message = $"Auto-Checkout: Client duration done{roomStr}";
            }
            else if (booking.Status == BookingStatus.Cancelled)
            {
                message = "Pending booking auto-cancelled (unverified after 4-hour grace)";
            }

            return new BookingNotificationDto(
                booking.Id,
                booking.Reference,
                booking.GuestName,
                booking.Kind,
                booking.Status,
                booking.CheckInAtUtc,
                booking.CreatedAtUtc,
                booking.IsNotificationCleared,
                message);
        }).ToList();
    }
}
