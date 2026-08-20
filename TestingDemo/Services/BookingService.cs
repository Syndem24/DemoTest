using System.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class BookingService : IBookingService
{
    /// <summary>
    /// Statuses that deduct room-type inventory for overlapping stay dates.
    /// </summary>
    private static readonly BookingStatus[] DeductStatuses =
        [BookingStatus.Pending, BookingStatus.Confirmed];

    /// <summary>
    /// Pending (unverified) stays are kept this long after check-in before auto-cancel.
    /// If the guest booked after the scheduled check-in time (e.g. 3pm book with 2pm default),
    /// the window starts from CreatedAtUtc so late same-day bookings still get a fair grace.
    /// </summary>
    private static readonly TimeSpan PendingUnverifiedGrace = TimeSpan.FromHours(4);

    /// <summary>
    /// How long history export audit logs remain before auto-deletion.
    /// </summary>
    public static readonly TimeSpan FlushLogRetention = TimeSpan.FromDays(7);

    private readonly HotelBookingDbContext _db;
    private readonly IWebHostEnvironment _environment;

    public BookingService(HotelBookingDbContext db, IWebHostEnvironment environment)
    {
        _db = db;
        _environment = environment;
    }

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
        var held = await GetHeldQuantityByTypeAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);

        return capacities
            .Select(item =>
            {
                held.TryGetValue(item.RoomTypeId, out var used);
                return new RoomAvailabilityDto(
                    item.RoomTypeId,
                    item.RoomTypeName,
                    item.Capacity,
                    Math.Max(0, item.Capacity - used),
                    item.PricePerNight);
            })
            .OrderBy(item => item.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<BookingDto> CreateAsync(
        CreateBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        var checkInAtUtc = PhilippinesTime.ToUtc(request.CheckInAtUtc);
        var checkoutTimeUtc = PhilippinesTime.ToUtc(request.CheckoutTimeUtc);
        ValidateDates(checkInAtUtc, checkoutTimeUtc);

        var requestedItems = request.Items
            .GroupBy(line => line.RoomTypeId)
            .Select(group => new CreateBookingItemRequest
            {
                RoomTypeId = group.Key,
                Quantity = group.Sum(line => line.Quantity)
            })
            .ToList();

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var availability = await GetAvailabilityAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            cancellationToken);
        var availabilityByType = availability.ToDictionary(item => item.RoomTypeId);

        foreach (var line in requestedItems)
        {
            if (!availabilityByType.TryGetValue(line.RoomTypeId, out var roomType))
            {
                throw new BookingAvailabilityException(
                    "One of the selected room types is no longer available.",
                    availability);
            }

            if (line.Quantity > roomType.Remaining)
            {
                throw new BookingAvailabilityException(
                    $"{roomType.RoomTypeName} has only {roomType.Remaining} room(s) available for those dates.",
                    availability);
            }
        }

        var nowUtc = DateTime.UtcNow;
        var booking = new Booking
        {
            Reference = CreateReference(),
            GuestName = request.GuestName.Trim(),
            GuestEmail = request.GuestEmail.Trim(),
            GuestPhone = request.GuestPhone.Trim(),
            CheckInAtUtc = checkInAtUtc,
            CheckoutTimeUtc = checkoutTimeUtc,
            PaymentOption = PaymentOption.Full,
            Kind = BookingKind.Booking,
            Status = BookingStatus.Pending,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };

        foreach (var requested in requestedItems)
        {
            var roomType = availabilityByType[requested.RoomTypeId];
            booking.Items.Add(new BookingItem
            {
                RoomTypeId = requested.RoomTypeId,
                RoomTypeName = roomType.RoomTypeName,
                Quantity = requested.Quantity,
                PricePerNight = roomType.PricePerNight
            });
        }

        var typeMeta = await LoadRoomTypeMetaAsync(
            requestedItems.Select(item => item.RoomTypeId),
            cancellationToken);
        ReplaceTimeFees(
            booking,
            StayTimeFees.IsEarlyCheckIn(checkInAtUtc),
            StayTimeFees.LateCheckoutHours(checkoutTimeUtc),
            request.ExtraPersons,
            typeMeta);
        RecalculateTotals(booking);

        _db.Bookings.Add(booking);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return MapBooking(booking);
    }

    public async Task<BookingDto> CreateWalkInAsync(
        CreateWalkInRequest request,
        CancellationToken cancellationToken = default)
    {
        var checkInAtUtc = PhilippinesTime.ToUtc(request.CheckInAtUtc);
        var checkoutTimeUtc = PhilippinesTime.ToUtc(request.CheckoutTimeUtc);
        ValidateDates(checkInAtUtc, checkoutTimeUtc);
        EnsureRoomAssignmentAllowed(checkInAtUtc);

        if (request.Assignments is null || request.Assignments.Count == 0)
        {
            throw new ArgumentException("Assign at least one room for the walk-in.");
        }

        var assignments = request.Assignments
            .GroupBy(item => item.RoomTypeId)
            .Select(group => new ConfirmRoomAssignmentRequest
            {
                RoomTypeId = group.Key,
                RoomIds = group.SelectMany(item => item.RoomIds ?? new List<int>())
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList()
            })
            .Where(item => item.RoomIds.Count > 0)
            .ToList();

        if (assignments.Count == 0)
        {
            throw new ArgumentException("Assign at least one room for the walk-in.");
        }

        var allRoomIds = assignments.SelectMany(item => item.RoomIds).ToList();
        if (allRoomIds.Count != allRoomIds.Distinct().Count())
        {
            throw new ArgumentException("Each room can only be assigned once.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var quantityByType = assignments
            .Select(item => (item.RoomTypeId, Quantity: item.RoomIds.Count))
            .ToList();
        await EnsureTypeInventoryAvailableAsync(
            quantityByType,
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: null,
            cancellationToken);

        var blockedRoomIds = await GetRoomIdsAssignedOnOverlappingStaysAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: null,
            cancellationToken);

        var rooms = await _db.Rooms
            .Include(room => room.RoomType)
            .Where(room => allRoomIds.Contains(room.Id))
            .ToListAsync(cancellationToken);

        if (rooms.Count != allRoomIds.Count)
        {
            throw new BookingAvailabilityException("One or more selected rooms no longer exist.");
        }

        foreach (var room in rooms)
        {
            if (room.Status != RoomStatus.Available || blockedRoomIds.Contains(room.Id))
            {
                throw new BookingAvailabilityException(
                    $"Room {room.RoomNumber} is no longer available for those dates.");
            }
        }

        var roomsById = rooms.ToDictionary(room => room.Id);
        foreach (var assignment in assignments)
        {
            foreach (var roomId in assignment.RoomIds)
            {
                var room = roomsById[roomId];
                if (room.RoomTypeId != assignment.RoomTypeId)
                {
                    throw new ArgumentException(
                        $"Room {room.RoomNumber} does not match the selected room type.");
                }
            }
        }

        var nowUtc = DateTime.UtcNow;
        var booking = new Booking
        {
            Reference = CreateReference(),
            GuestName = request.GuestName.Trim(),
            GuestEmail = request.GuestEmail.Trim(),
            GuestPhone = request.GuestPhone.Trim(),
            CheckInAtUtc = checkInAtUtc,
            CheckoutTimeUtc = checkoutTimeUtc,
            PaymentOption = PaymentOption.Full,
            Kind = BookingKind.Booking,
            Status = BookingStatus.Confirmed,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            IsNotificationCleared = false
        };

        foreach (var assignment in assignments)
        {
            var sample = roomsById[assignment.RoomIds[0]];
            booking.Items.Add(new BookingItem
            {
                RoomTypeId = assignment.RoomTypeId,
                RoomTypeName = sample.RoomType.Name,
                Quantity = assignment.RoomIds.Count,
                PricePerNight = sample.RoomType.PricePerNight
            });
        }

        var typeMeta = await LoadRoomTypeMetaAsync(
            assignments.Select(item => item.RoomTypeId),
            cancellationToken);
        ReplaceTimeFees(
            booking,
            StayTimeFees.IsEarlyCheckIn(checkInAtUtc),
            StayTimeFees.LateCheckoutHours(checkoutTimeUtc),
            request.ExtraPersons,
            typeMeta);
        RecalculateTotals(booking);

        _db.Bookings.Add(booking);
        await _db.SaveChangesAsync(cancellationToken);

        await AssignAndOccupyRoomsAsync(booking, assignments, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var saved = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .FirstAsync(item => item.Id == booking.Id, cancellationToken);

        return MapBooking(saved);
    }

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
            .Include(booking => booking.Items)
                .ThenInclude(line => line.RoomType)
            .Include(booking => booking.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(booking => booking.Charges)
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

        var total = await query.CountAsync(cancellationToken);
        var bookings = await query
            .OrderByDescending(booking => booking.CreatedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedBookingsDto(
            bookings.Select(MapBooking).ToList(),
            page,
            pageSize,
            total);
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
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        return booking == null ? null : MapBooking(booking);
    }

    public async Task<BookingDto?> GetActiveStayByRoomIdAsync(
        int roomId,
        CancellationToken cancellationToken = default)
    {
        var bookingId = await _db.AssignedRooms
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

        var bookingIdsByRoom = await _db.AssignedRooms
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
                .ThenInclude(line => line.AssignedRooms)
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

    public async Task<IReadOnlyList<ReservationCalendarEventDto>> GetReservationCalendarAsync(
        DateTime start,
        DateTime end,
        CancellationToken cancellationToken = default)
    {
        if (end <= start || (end - start).TotalDays > 370)
        {
            throw new ArgumentException("Choose a calendar range of one year or less.");
        }

        var stays = await _db.Bookings
            .AsNoTracking()
            .Include(booking => booking.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(booking => booking.Charges)
            .Where(booking =>
                !booking.IsArchived
                && booking.Status != BookingStatus.Rejected
                && booking.CheckInAtUtc < end
                && booking.CheckoutTimeUtc > start)
            .OrderBy(booking => booking.CheckInAtUtc)
            .ThenBy(booking => booking.GuestName)
            .ToListAsync(cancellationToken);

        return stays
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

                return new ReservationCalendarEventDto(
                    booking.Id,
                    $"{kindLabel} · {booking.Reference} · {booking.GuestName}",
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
                        var assigned = (line.AssignedRooms ?? Array.Empty<AssignedRoom>())
                            .Select(assignment => assignment.Room?.RoomNumber)
                            .Where(number => !string.IsNullOrWhiteSpace(number))
                            .ToList();
                        return assigned.Count > 0
                            ? $"{line.RoomTypeName}: {string.Join(", ", assigned)}"
                            : $"{line.Quantity}× {line.RoomTypeName}";
                    })),
                    extensionNights);
            })
            .ToList();
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
                .ThenInclude(i => i.AssignedRooms)
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
                .SelectMany(i => i.AssignedRooms)
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
                message = $"Call guest: checkout in 20 mins — ask about late checkout{roomStr}";
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

    public async Task<IReadOnlyList<BookingDto>> AutoCheckoutExpiredBookingsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var activeConfirmedBookings = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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
                .ThenInclude(line => line.AssignedRooms)
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

    public async Task<IReadOnlyList<BookingDto>> AutoCancelExpiredPendingAsync(
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        // Past scheduled check-in only — never cancel before arrival time.
        var candidates = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
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

    public Task<int> GetUnreadCountAsync(CancellationToken cancellationToken = default)
    {
        return _db.Bookings.AsNoTracking()
            .CountAsync(
                booking =>
                    !booking.IsNotificationCleared
                    && (!booking.IsArchived || booking.Status == BookingStatus.Cancelled),
                cancellationToken);
    }

    public async Task<BookingDto?> MarkReadAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (booking is null)
        {
            return null;
        }

        if (!booking.IsNotificationCleared)
        {
            booking.IsNotificationCleared = true;
            booking.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return MapBooking(booking);
    }

    public async Task MarkAllAsReadAsync(CancellationToken cancellationToken = default)
    {
        var bookings = await _db.Bookings
            .Where(booking =>
                !booking.IsNotificationCleared
                && (!booking.IsArchived || booking.Status == BookingStatus.Cancelled))
            .ToListAsync(cancellationToken);

        if (bookings.Count == 0)
        {
            return;
        }

        var now = DateTime.UtcNow;
        foreach (var booking in bookings)
        {
            booking.IsNotificationCleared = true;
            booking.UpdatedAtUtc = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AssignableRoomsByTypeDto>> GetAssignableRoomsAsync(
        int bookingId,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
            .FirstOrDefaultAsync(item => item.Id == bookingId, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("Only active bookings can be assigned rooms.");
        }

        if (booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
        {
            throw new BookingConcurrencyException("Only pending or confirmed bookings can be assigned rooms.");
        }

        if (booking.Status == BookingStatus.Confirmed
            && booking.Items.Any(line => line.AssignedRooms.Count > 0))
        {
            throw new BookingConcurrencyException("This booking already has rooms assigned.");
        }

        var typeIds = booking.Items
            .Where(line => line.RoomTypeId.HasValue)
            .Select(line => line.RoomTypeId!.Value)
            .ToList();

        var blockedRoomIds = await GetRoomIdsAssignedOnOverlappingStaysAsync(
            booking.CheckInAtUtc,
            booking.CheckoutTimeUtc,
            excludeBookingId: booking.Id,
            cancellationToken);

        var rooms = await _db.Rooms
            .AsNoTracking()
            .Where(room =>
                typeIds.Contains(room.RoomTypeId)
                && room.Status == RoomStatus.Available)
            .OrderBy(room => room.RoomNumber)
            .Select(room => new AssignableRoomDto(
                room.Id,
                room.RoomNumber,
                room.RoomTypeId,
                room.RoomType.Name))
            .ToListAsync(cancellationToken);

        if (blockedRoomIds.Count > 0)
        {
            rooms = rooms.Where(room => !blockedRoomIds.Contains(room.RoomId)).ToList();
        }

        var roomsByType = rooms.GroupBy(room => room.RoomTypeId)
            .ToDictionary(group => group.Key, group => group.ToList());

        return booking.Items
            .Where(line => line.RoomTypeId.HasValue)
            .OrderBy(line => line.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .Select(line =>
            {
                roomsByType.TryGetValue(line.RoomTypeId!.Value, out var options);
                return new AssignableRoomsByTypeDto(
                    line.RoomTypeId.Value,
                    line.RoomTypeName,
                    line.Quantity,
                    options ?? new List<AssignableRoomDto>());
            })
            .ToList();
    }

    public async Task<BookingDto> UpdateStatusAsync(
        int id,
        BookingStatus status,
        IReadOnlyList<ConfirmRoomAssignmentRequest>? assignments = null,
        CancellationToken cancellationToken = default)
    {
        if (status is not (BookingStatus.Confirmed or BookingStatus.Rejected))
        {
            throw new ArgumentException("Only Confirmed or Rejected are valid status updates.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        if (booking.Status != BookingStatus.Pending)
        {
            throw new BookingConcurrencyException("This booking has already been reviewed.");
        }

        if (status == BookingStatus.Confirmed
            && assignments is { Count: > 0 })
        {
            EnsureRoomAssignmentAllowed(booking);
            await AssignAndOccupyRoomsAsync(booking, assignments, cancellationToken);
        }

        var now = DateTime.UtcNow;
        booking.Status = status;
        booking.IsNotificationCleared = false;
        booking.UpdatedAtUtc = now;

        // Confirming inside the arrival window should surface the arrival notice immediately.
        if (status == BookingStatus.Confirmed
            && booking.ArrivalWarningSentAtUtc == null
            && now >= booking.CheckInAtUtc.AddMinutes(-20)
            && now < booking.CheckInAtUtc)
        {
            booking.ArrivalWarningSentAtUtc = now;
        }

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> AssignRoomsAsync(
        int id,
        IReadOnlyList<ConfirmRoomAssignmentRequest> assignments,
        CancellationToken cancellationToken = default)
    {
        if (assignments is null || assignments.Count == 0)
        {
            throw new ArgumentException("Select room numbers before assigning.");
        }

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException("Confirm the booking before assigning rooms, or confirm with rooms in one step.");
        }

        if (booking.Items.Any(line => line.AssignedRooms.Count > 0))
        {
            throw new BookingConcurrencyException("This booking already has rooms assigned.");
        }

        var paid = await _db.PaymentRecords
            .Where(p => p.BookingId == booking.Id && p.Status == PaymentRecordStatus.Posted)
            .SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;
        var balanceDue = decimal.Round(booking.TotalAmount - paid, 2, MidpointRounding.AwayFromZero);
        if (balanceDue > 0.009m)
        {
            throw new BookingConcurrencyException(
                $"Guest must be fully paid before assigning rooms. Balance due: ₱{balanceDue:N2}.");
        }

        EnsureRoomAssignmentAllowed(booking);
        await AssignAndOccupyRoomsAsync(booking, assignments, cancellationToken);
        booking.IsNotificationCleared = false;
        booking.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> UpdateAsync(
        int id,
        UpdateBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        var checkInAtUtc = PhilippinesTime.ToUtc(request.CheckInAtUtc);
        var checkoutTimeUtc = PhilippinesTime.ToUtc(request.CheckoutTimeUtc);

        var requestedItems = request.Items
            .Where(line => line.Quantity > 0)
            .GroupBy(line => line.RoomTypeId)
            .Select(group => new CreateBookingItemRequest
            {
                RoomTypeId = group.Key,
                Quantity = group.Sum(line => line.Quantity)
            })
            .ToList();

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Charges)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("Bookings in history cannot be edited.");
        }

        if (booking.Status is not BookingStatus.Pending and not BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException(
                "Only pending or confirmed bookings can be edited.");
        }

        var hasAssignments = booking.Items.Any(line => line.AssignedRooms.Count > 0);
        ValidateDates(checkInAtUtc, checkoutTimeUtc, allowPastCheckIn: hasAssignments);

        if (hasAssignments)
        {
            // Hard edit: contact + dates only; keep assigned rooms and quantities.
            if (booking.Status != BookingStatus.Confirmed)
            {
                throw new BookingConcurrencyException(
                    "Rooms are already assigned — only confirmed stays can be corrected.");
            }

            var existingByType = booking.Items
                .Where(line => line.RoomTypeId.HasValue)
                .ToDictionary(line => line.RoomTypeId!.Value, line => line);

            if (requestedItems.Count == 0)
            {
                throw new ArgumentException("At least one room type is required.");
            }

            foreach (var requested in requestedItems)
            {
                if (!existingByType.TryGetValue(requested.RoomTypeId, out var line)
                    || line.Quantity != requested.Quantity)
                {
                    throw new BookingConcurrencyException(
                        "Room types and quantities cannot change after rooms are assigned. Correct guest details or stay dates only.");
                }
            }

            foreach (var typeId in existingByType.Keys)
            {
                if (requestedItems.All(r => r.RoomTypeId != typeId))
                {
                    throw new BookingConcurrencyException(
                        "Room types and quantities cannot change after rooms are assigned. Correct guest details or stay dates only.");
                }
            }

            var blockedRoomIds = await GetRoomIdsAssignedOnOverlappingStaysAsync(
                checkInAtUtc,
                checkoutTimeUtc,
                excludeBookingId: booking.Id,
                cancellationToken);

            foreach (var line in booking.Items)
            {
                foreach (var assignment in line.AssignedRooms)
                {
                    var roomNumber = assignment.Room?.RoomNumber ?? $"#{assignment.RoomId}";
                    if (blockedRoomIds.Contains(assignment.RoomId))
                    {
                        throw new BookingAvailabilityException(
                            $"Room {roomNumber} is already held by another stay for those dates. Keep the current dates or cancel and rebook.");
                    }
                }
            }
        }
        else
        {
            var requestedTypeIds = requestedItems.Select(line => line.RoomTypeId).ToList();
            var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
            var capacityByType = capacities
                .Where(item => requestedTypeIds.Contains(item.RoomTypeId))
                .ToDictionary(item => item.RoomTypeId);

            foreach (var requested in requestedItems)
            {
                if (!capacityByType.TryGetValue(requested.RoomTypeId, out var roomType))
                {
                    throw new BookingAvailabilityException(
                        "One of the selected room types is no longer operationally available.");
                }

                var heldByOthers = await GetHeldQuantityForTypeAsync(
                    requested.RoomTypeId,
                    checkInAtUtc,
                    checkoutTimeUtc,
                    excludeBookingId: booking.Id,
                    cancellationToken);

                if (heldByOthers + requested.Quantity > roomType.Capacity)
                {
                    var remaining = Math.Max(0, roomType.Capacity - heldByOthers);
                    throw new BookingAvailabilityException(
                        $"{roomType.RoomTypeName} has only {remaining} room(s) available for those dates.");
                }
            }

            var requestedByType = requestedItems.ToDictionary(line => line.RoomTypeId);
            foreach (var existing in booking.Items.ToList())
            {
                if (!existing.RoomTypeId.HasValue
                    || !requestedByType.ContainsKey(existing.RoomTypeId.Value))
                {
                    _db.BookingItems.Remove(existing);
                    booking.Items.Remove(existing);
                }
            }

            foreach (var requested in requestedItems)
            {
                var roomType = capacityByType[requested.RoomTypeId];
                var line = booking.Items.FirstOrDefault(
                    existing => existing.RoomTypeId == requested.RoomTypeId);
                if (line == null)
                {
                    line = new BookingItem { RoomTypeId = requested.RoomTypeId };
                    booking.Items.Add(line);
                }

                line.RoomTypeName = roomType.RoomTypeName;
                line.Quantity = requested.Quantity;
                line.PricePerNight = roomType.PricePerNight;
            }
        }

        booking.GuestName = request.GuestName.Trim();
        booking.GuestEmail = request.GuestEmail.Trim();
        booking.GuestPhone = request.GuestPhone.Trim();
        if (booking.CheckInAtUtc != checkInAtUtc)
        {
            booking.ArrivalWarningSentAtUtc = null;
            booking.PendingCallWarningSentAtUtc = null;
        }
        booking.CheckInAtUtc = checkInAtUtc;
        if (booking.CheckoutTimeUtc != checkoutTimeUtc)
        {
            booking.CheckoutWarningSentAtUtc = null;
        }
        booking.CheckoutTimeUtc = checkoutTimeUtc;
        if (request.PaymentOption.HasValue
            && request.PaymentOption.Value != booking.PaymentOption)
        {
            booking.PaymentOption = request.PaymentOption.Value;
            booking.Kind = Classify(booking.PaymentOption);
        }

        booking.UpdatedAtUtc = DateTime.UtcNow;
        var early = StayTimeFees.IsEarlyCheckIn(checkInAtUtc);
        var lateHours = StayTimeFees.LateCheckoutHours(checkoutTimeUtc);
        var extraPersons = booking.Charges
            .Where(c => c.ChargeType == BookingChargeType.ExtraPerson)
            .Select(c => c.Quantity)
            .FirstOrDefault();
        var typeMeta = await LoadRoomTypeMetaAsync(
            booking.Items.Where(line => line.RoomTypeId.HasValue).Select(line => line.RoomTypeId!.Value),
            cancellationToken);
        ReplaceTimeFees(booking, early, lateHours, extraPersons, typeMeta);
        RecalculateTotals(booking);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> UpdateChargesAsync(
        int id,
        UpdateBookingChargesRequest request,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("Bookings in history cannot be edited.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException(
                "Confirm the booking before adding stay fees / service charges.");
        }

        var extendNights = Math.Max(0, request.ExtendStayNights);
        if (extendNights > 30)
        {
            throw new ArgumentException("Stay extension is limited to 30 nights per save.");
        }

        if (request.RevertStayExtension)
        {
            RevertStayExtension(booking);
        }

        if (extendNights > 0)
        {
            var newCheckout = AddManilaCalendarDays(booking.CheckoutTimeUtc, extendNights);
            await EnsureBookingItemsAvailableAsync(
                booking,
                booking.CheckInAtUtc,
                newCheckout,
                cancellationToken);
            booking.CheckoutTimeUtc = newCheckout;
            booking.CheckoutWarningSentAtUtc = null;
        }

        var typeMeta = await LoadRoomTypeMetaAsync(
            booking.Items.Where(line => line.RoomTypeId.HasValue).Select(line => line.RoomTypeId!.Value),
            cancellationToken);
        ReplaceTimeFees(
            booking,
            request.EarlyCheckIn,
            request.LateCheckoutHours,
            request.ExtraPersons,
            typeMeta);
        UpsertReceptionExtras(booking, request, extendNights);
        booking.UpdatedAtUtc = DateTime.UtcNow;
        RecalculateTotals(booking);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> CancelAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        booking.Status = BookingStatus.Cancelled;
        booking.IsArchived = true;
        booking.ArchivedAtUtc = DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        ReleaseAssignedRooms(booking);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> CheckoutAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException("Only confirmed bookings with assigned rooms can be checked out.");
        }

        if (!booking.Items.SelectMany(i => i.AssignedRooms).Any())
        {
            throw new BookingConcurrencyException("Assign rooms before checking out this guest.");
        }

        booking.Status = BookingStatus.CheckedOut;
        booking.IsArchived = true;
        booking.ArchivedAtUtc = DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        ReleaseAssignedRooms(booking);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<FlushBookingHistoryResult> FlushHistoryAsync(
        string performedBy,
        CancellationToken cancellationToken = default)
    {
        performedBy = performedBy?.Trim() ?? string.Empty;
        if (performedBy.Length < 2 || performedBy.Length > 120)
        {
            throw new ArgumentException("Enter the staff name who is exporting history (2–120 characters).");
        }

        await PurgeExpiredHistoryFlushLogsAsync(cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var archived = await _db.Bookings
            .Include(booking => booking.Items)
                .ThenInclude(item => item.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Where(booking => booking.IsArchived)
            .OrderByDescending(booking => booking.ArchivedAtUtc ?? booking.UpdatedAtUtc)
            .ToListAsync(cancellationToken);

        if (archived.Count == 0)
        {
            throw new ArgumentException("History is empty — nothing to export.");
        }

        var flushedAtUtc = DateTime.UtcNow;
        var stamp = PhilippinesTime.ToManila(flushedAtUtc).ToString("yyyyMMdd-HHmm");
        var fileName = $"Mori-History-Export-{stamp}.pdf";
        var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
        var pdfBytes = BookingHistoryPdfBuilder.Build(archived, performedBy, flushedAtUtc, logoPath);

        var summary = BuildFlushSummary(archived);

        _db.Bookings.RemoveRange(archived);

        var log = new BookingHistoryFlushLog
        {
            FlushedAtUtc = flushedAtUtc,
            PerformedBy = performedBy,
            RecordCount = archived.Count,
            FileName = fileName,
            Summary = summary.Length > 2000 ? summary[..2000] : summary
        };
        _db.BookingHistoryFlushLogs.Add(log);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return new FlushBookingHistoryResult(
            pdfBytes,
            fileName,
            MapHistoryFlushLog(log));
    }

    public async Task<IReadOnlyList<BookingHistoryFlushLogDto>> GetHistoryFlushLogsAsync(
        CancellationToken cancellationToken = default)
    {
        await PurgeExpiredHistoryFlushLogsAsync(cancellationToken);

        return await _db.BookingHistoryFlushLogs
            .AsNoTracking()
            .OrderByDescending(log => log.FlushedAtUtc)
            .Take(50)
            .Select(log => new BookingHistoryFlushLogDto(
                log.Id,
                log.FlushedAtUtc,
                log.FlushedAtUtc.Add(FlushLogRetention),
                log.PerformedBy,
                log.RecordCount,
                log.FileName,
                log.Summary))
            .ToListAsync(cancellationToken);
    }

    private async Task PurgeExpiredHistoryFlushLogsAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(FlushLogRetention);
        var expired = await _db.BookingHistoryFlushLogs
            .Where(log => log.FlushedAtUtc < cutoff)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
        {
            return;
        }

        _db.BookingHistoryFlushLogs.RemoveRange(expired);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static BookingHistoryFlushLogDto MapHistoryFlushLog(BookingHistoryFlushLog log)
    {
        return new BookingHistoryFlushLogDto(
            log.Id,
            log.FlushedAtUtc,
            log.FlushedAtUtc.Add(FlushLogRetention),
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);
    }

    private static string BuildFlushSummary(IReadOnlyList<Booking> archived)
    {
        var checkedOut = archived.Count(b => b.Status == BookingStatus.CheckedOut);
        var cancelled = archived.Count(b => b.Status == BookingStatus.Cancelled);
        var other = archived.Count - checkedOut - cancelled;
        var totalValue = archived.Sum(b => b.TotalAmount);
        var stayStart = archived.Min(b => b.CheckInAtUtc);
        var stayEnd = archived.Max(b => b.CheckoutTimeUtc);
        var startLocal = PhilippinesTime.ToManila(stayStart);
        var endLocal = PhilippinesTime.ToManila(stayEnd);

        var roomTypes = archived
            .SelectMany(b => b.Items)
            .GroupBy(i => i.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Sum(i => i.Quantity))
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .Select(g => $"{g.Key} ({g.Sum(i => i.Quantity)})")
            .ToList();

        var statusParts = new List<string>();
        if (checkedOut > 0) statusParts.Add($"Checked out: {checkedOut}");
        if (cancelled > 0) statusParts.Add($"Cancelled: {cancelled}");
        if (other > 0) statusParts.Add($"Other: {other}");

        var lines = new List<string>
        {
            string.Join(" · ", statusParts),
            $"Stay range: {startLocal:MMM d, yyyy} – {endLocal:MMM d, yyyy} (PH)",
            $"Total value: ₱{totalValue:N2}",
            roomTypes.Count > 0
                ? $"Rooms: {string.Join(", ", roomTypes)}"
                : "Rooms: —",
            "Export log retained for 7 days, then auto-deleted."
        };

        var summary = string.Join('\n', lines);
        return summary.Length > 2000 ? summary[..2000] : summary;
    }

    private async Task AssignAndOccupyRoomsAsync(
        Booking booking,
        IReadOnlyList<ConfirmRoomAssignmentRequest>? assignments,
        CancellationToken cancellationToken)
    {
        if (assignments == null || assignments.Count == 0)
        {
            return;
        }

        var assignmentsByType = assignments
            .GroupBy(item => item.RoomTypeId)
            .ToDictionary(
                group => group.Key,
                group => group.SelectMany(item => item.RoomIds ?? new List<int>())
                    .Where(id => id > 0)
                    .Distinct()
                    .ToList());

        var allRequestedIds = assignmentsByType.Values.SelectMany(ids => ids).ToList();
        if (allRequestedIds.Count != allRequestedIds.Distinct().Count())
        {
            throw new ArgumentException("Each room can only be assigned once.");
        }

        foreach (var line in booking.Items)
        {
            if (!line.RoomTypeId.HasValue)
            {
                throw new BookingConcurrencyException(
                    $"Room type '{line.RoomTypeName}' is no longer available to assign.");
            }

            if (!assignmentsByType.TryGetValue(line.RoomTypeId.Value, out var roomIds)
                || roomIds.Count != line.Quantity)
            {
                throw new ArgumentException(
                    $"Select {line.Quantity} available room(s) for {line.RoomTypeName}.");
            }
        }

        var bookingTypeIds = booking.Items
            .Where(line => line.RoomTypeId.HasValue)
            .Select(line => line.RoomTypeId!.Value);
        if (assignmentsByType.Keys.Except(bookingTypeIds).Any())
        {
            throw new ArgumentException("One or more assigned room types are not on this booking.");
        }

        var rooms = await _db.Rooms
            .Where(room => allRequestedIds.Contains(room.Id))
            .ToListAsync(cancellationToken);

        if (rooms.Count != allRequestedIds.Count)
        {
            throw new BookingAvailabilityException("One or more selected rooms no longer exist.");
        }

        var blockedRoomIds = await GetRoomIdsAssignedOnOverlappingStaysAsync(
            booking.CheckInAtUtc,
            booking.CheckoutTimeUtc,
            excludeBookingId: booking.Id,
            cancellationToken);

        var roomsById = rooms.ToDictionary(room => room.Id);
        foreach (var line in booking.Items)
        {
            var roomIds = assignmentsByType[line.RoomTypeId!.Value];
            foreach (var roomId in roomIds)
            {
                var room = roomsById[roomId];
                if (room.RoomTypeId != line.RoomTypeId)
                {
                    throw new ArgumentException(
                        $"Room {room.RoomNumber} is not a {line.RoomTypeName}.");
                }

                if (room.Status != RoomStatus.Available || blockedRoomIds.Contains(room.Id))
                {
                    throw new BookingAvailabilityException(
                        $"Room {room.RoomNumber} is no longer available for those dates.");
                }

                room.Status = RoomStatus.Occupied;
                line.AssignedRooms.Add(new AssignedRoom
                {
                    RoomId = room.Id
                });
            }
        }
    }

    private static void ReleaseAssignedRooms(Booking booking)
    {
        foreach (var line in booking.Items)
        {
            foreach (var assignment in line.AssignedRooms)
            {
                if (assignment.Room != null && assignment.Room.Status == RoomStatus.Occupied)
                {
                    // Vacant dirty — receptionist marks Available after cleaning.
                    assignment.Room.Status = RoomStatus.Cleaning;
                }
            }
        }
    }

    private sealed record RoomTypeCapacity(
        int RoomTypeId,
        string RoomTypeName,
        int Capacity,
        decimal PricePerNight);

    private async Task<IReadOnlyList<RoomTypeCapacity>> GetPhysicalCapacityByTypeAsync(
        CancellationToken cancellationToken)
    {
        return await _db.Rooms
            .AsNoTracking()
            .Where(room => room.Status != RoomStatus.Unavailable)
            .GroupBy(room => new { room.RoomTypeId, room.RoomType.Name, room.RoomType.PricePerNight })
            .Select(group => new RoomTypeCapacity(
                group.Key.RoomTypeId,
                group.Key.Name,
                group.Count(),
                group.Key.PricePerNight))
            .ToListAsync(cancellationToken);
    }

    private async Task<Dictionary<int, int>> GetHeldQuantityByTypeAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        var query = _db.BookingItems
            .AsNoTracking()
            .Where(line =>
                line.RoomTypeId != null
                && !line.Booking.IsArchived
                && DeductStatuses.Contains(line.Booking.Status)
                && line.Booking.CheckInAtUtc < checkoutTimeUtc
                && line.Booking.CheckoutTimeUtc > checkInAtUtc);

        if (excludeBookingId.HasValue)
        {
            var excludedId = excludeBookingId.Value;
            query = query.Where(line => line.BookingId != excludedId);
        }

        return await query
            .GroupBy(line => line.RoomTypeId!.Value)
            .Select(group => new
            {
                RoomTypeId = group.Key,
                Quantity = group.Sum(line => line.Quantity)
            })
            .ToDictionaryAsync(item => item.RoomTypeId, item => item.Quantity, cancellationToken);
    }

    private async Task<int> GetHeldQuantityForTypeAsync(
        int roomTypeId,
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        var held = await GetHeldQuantityByTypeAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);
        return held.TryGetValue(roomTypeId, out var quantity) ? quantity : 0;
    }

    private async Task EnsureTypeInventoryAvailableAsync(
        IReadOnlyList<(int RoomTypeId, int Quantity)> requested,
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        if (requested.Count == 0)
        {
            return;
        }

        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var capacityByType = capacities.ToDictionary(item => item.RoomTypeId);
        var held = await GetHeldQuantityByTypeAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);
        var availability = capacities
            .Select(item =>
            {
                held.TryGetValue(item.RoomTypeId, out var used);
                return new RoomAvailabilityDto(
                    item.RoomTypeId,
                    item.RoomTypeName,
                    item.Capacity,
                    Math.Max(0, item.Capacity - used),
                    item.PricePerNight);
            })
            .ToList();

        foreach (var group in requested.GroupBy(item => item.RoomTypeId))
        {
            var quantity = group.Sum(item => item.Quantity);
            if (!capacityByType.TryGetValue(group.Key, out var capacity))
            {
                throw new BookingAvailabilityException(
                    "One of the selected room types is no longer available.",
                    availability);
            }

            held.TryGetValue(group.Key, out var used);
            var remaining = Math.Max(0, capacity.Capacity - used);
            if (quantity > remaining)
            {
                throw new BookingAvailabilityException(
                    $"{capacity.RoomTypeName} has only {remaining} room(s) available for those dates.",
                    availability);
            }
        }
    }

    private async Task<HashSet<int>> GetRoomIdsAssignedOnOverlappingStaysAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        var query = _db.AssignedRooms
            .AsNoTracking()
            .Where(assignment =>
                !assignment.BookingItem.Booking.IsArchived
                && assignment.BookingItem.Booking.Status == BookingStatus.Confirmed
                && assignment.BookingItem.Booking.CheckInAtUtc < checkoutTimeUtc
                && assignment.BookingItem.Booking.CheckoutTimeUtc > checkInAtUtc);

        if (excludeBookingId.HasValue)
        {
            var excludedId = excludeBookingId.Value;
            query = query.Where(assignment => assignment.BookingItem.BookingId != excludedId);
        }

        var ids = await query
            .Select(assignment => assignment.RoomId)
            .Distinct()
            .ToListAsync(cancellationToken);
        return ids.ToHashSet();
    }

    private static void ValidateDates(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        bool allowPastCheckIn = false)
    {
        if (!allowPastCheckIn && checkInAtUtc < PhilippinesTime.StartOfTodayUtc())
        {
            throw new ArgumentException("Check-in cannot be in the past.");
        }

        if (checkoutTimeUtc <= checkInAtUtc)
        {
            throw new ArgumentException("Check-out must be after check-in.");
        }
    }

    private static void EnsureRoomAssignmentAllowed(Booking booking)
        => EnsureRoomAssignmentAllowed(booking.CheckInAtUtc);

    private static void EnsureRoomAssignmentAllowed(DateTime checkInAtUtc)
    {
        if (PhilippinesTime.IsOnOrAfterArrivalDate(checkInAtUtc))
        {
            return;
        }

        var arrival = PhilippinesTime.ToManila(checkInAtUtc).ToString("MMM d, yyyy");
        throw new BookingConcurrencyException(
            $"Rooms can only be assigned starting on the arrival date ({arrival}, Philippines time). Confirm without rooms until then.");
    }

    private static BookingKind Classify(PaymentOption paymentOption)
    {
        // Half payment is always a reservation, even when check-in is within 24 hours.
        return paymentOption == PaymentOption.Half
            ? BookingKind.Reservation
            : BookingKind.Booking;
    }

    private static decimal ComputeAmountDueNow(decimal totalAmount, PaymentOption paymentOption)
    {
        return paymentOption == PaymentOption.Half
            ? Math.Round(totalAmount / 2m, 2, MidpointRounding.AwayFromZero)
            : totalAmount;
    }

    /// <summary>
    /// Hotel nights = Manila calendar checkout date − check-in date (not elapsed hours).
    /// Early 11:30 / late checkout must not inflate the night count.
    /// </summary>
    private static int StayNights(DateTime checkInAtUtc, DateTime checkoutTimeUtc)
    {
        var checkInDate = PhilippinesTime.ToManila(checkInAtUtc).Date;
        var checkoutDate = PhilippinesTime.ToManila(checkoutTimeUtc).Date;
        return Math.Max(1, (checkoutDate - checkInDate).Days);
    }

    private static int RoomCount(Booking booking)
    {
        return booking.Items.Sum(line => Math.Max(0, line.Quantity));
    }

    private async Task<Dictionary<int, (int MaxOccupancy, string Name)>> LoadRoomTypeMetaAsync(
        IEnumerable<int> roomTypeIds,
        CancellationToken cancellationToken)
    {
        var ids = roomTypeIds.Where(id => id > 0).Distinct().ToList();
        if (ids.Count == 0)
        {
            return new Dictionary<int, (int MaxOccupancy, string Name)>();
        }

        return await _db.RoomTypes
            .AsNoTracking()
            .Where(type => ids.Contains(type.RoomTypeId))
            .ToDictionaryAsync(
                type => type.RoomTypeId,
                type => (type.MaxOccupancy, type.Name),
                cancellationToken);
    }

    private static bool BookingAllowsExtraPerson(
        Booking booking,
        IReadOnlyDictionary<int, (int MaxOccupancy, string Name)> typeMeta)
    {
        // Extra person (max 1, ₱200/night) is allowed on any room selection.
        _ = booking;
        _ = typeMeta;
        return true;
    }

    private static readonly BookingChargeType[] TimeFeeTypes =
    [
        BookingChargeType.EarlyCheckIn,
        BookingChargeType.LateCheckout,
        BookingChargeType.ExtraPerson
    ];

    /// <summary>
    /// Rebuilds early / late / extra-person charges only; preserves reception extras.
    /// </summary>
    private void ReplaceTimeFees(
        Booking booking,
        bool earlyCheckIn,
        int lateCheckoutHours,
        int extraPersons,
        IReadOnlyDictionary<int, (int MaxOccupancy, string Name)> typeMeta)
    {
        lateCheckoutHours = Math.Clamp(lateCheckoutHours, 0, StayTimeFees.MaxLateCheckoutHours);
        extraPersons = Math.Clamp(extraPersons, 0, StayTimeFees.MaxExtraPersonsOnSingleRoom);
        if (!BookingAllowsExtraPerson(booking, typeMeta))
        {
            extraPersons = 0;
        }

        booking.CheckInAtUtc = StayTimeFees.WithManilaTimeOfDay(
            booking.CheckInAtUtc,
            earlyCheckIn ? StayTimeFees.EarlyCheckInTime : StayTimeFees.DefaultCheckInTime);
        booking.CheckoutTimeUtc = StayTimeFees.WithManilaTimeOfDay(
            booking.CheckoutTimeUtc,
            StayTimeFees.DefaultCheckOutTime + TimeSpan.FromHours(lateCheckoutHours));

        var toRemove = booking.Charges
            .Where(c => TimeFeeTypes.Contains(c.ChargeType))
            .ToList();
        if (toRemove.Count > 0)
        {
            _db.BookingCharges.RemoveRange(toRemove);
            foreach (var charge in toRemove)
            {
                booking.Charges.Remove(charge);
            }
        }

        var rooms = RoomCount(booking);
        var nights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
        var now = DateTime.UtcNow;

        if (earlyCheckIn && rooms > 0)
        {
            var amount = StayTimeFees.EarlyCheckInFeePerRoom * rooms;
            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.EarlyCheckIn,
                Label = $"Early check-in (11:30 AM) · {rooms} room{(rooms == 1 ? "" : "s")}",
                Quantity = rooms,
                Nights = 1,
                UnitAmount = StayTimeFees.EarlyCheckInFeePerRoom,
                Amount = amount,
                CreatedAtUtc = now
            });
        }

        if (lateCheckoutHours > 0 && rooms > 0)
        {
            var amount = StayTimeFees.LateCheckoutFeePerRoomPerHour * lateCheckoutHours * rooms;
            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.LateCheckout,
                Label = $"Late check-out (+{lateCheckoutHours}h) · {rooms} room{(rooms == 1 ? "" : "s")}",
                Quantity = lateCheckoutHours,
                Nights = 1,
                UnitAmount = StayTimeFees.LateCheckoutFeePerRoomPerHour * rooms,
                Amount = amount,
                CreatedAtUtc = now
            });
        }

        if (extraPersons > 0)
        {
            var amount = StayTimeFees.ExtraPersonFeePerNight * extraPersons * nights;
            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.ExtraPerson,
                Label = $"Extra person · {extraPersons} × {nights} night{(nights == 1 ? "" : "s")}",
                Quantity = extraPersons,
                Nights = nights,
                UnitAmount = StayTimeFees.ExtraPersonFeePerNight,
                Amount = amount,
                CreatedAtUtc = now
            });
        }
    }

    private void UpsertReceptionExtras(
        Booking booking,
        UpdateBookingChargesRequest request,
        int extendNightsAdded)
    {
        var now = DateTime.UtcNow;
        var service = decimal.Round(Math.Max(0m, request.ServiceFeeAmount), 2, MidpointRounding.AwayFromZero);

        ReplaceIncidentalCharges(booking, request, now);

        if (service > 0m)
        {
            UpsertCharge(
                booking,
                BookingChargeType.ServiceFee,
                "Service fee",
                quantity: 1,
                nights: 1,
                unitAmount: service,
                amount: service,
                now);
        }
        else
        {
            RemoveChargesOfType(booking, BookingChargeType.ServiceFee);
        }

        ReplaceSnackBeverageCharges(booking, request, now);

        if (extendNightsAdded > 0)
        {
            var nightlyRoomTotal = booking.Items.Sum(line => line.PricePerNight * line.Quantity);
            var existing = booking.Charges.FirstOrDefault(c => c.ChargeType == BookingChargeType.StayExtension);
            var totalExtraNights = (existing?.Quantity ?? 0) + extendNightsAdded;
            var extensionAmount = decimal.Round(
                nightlyRoomTotal * totalExtraNights,
                2,
                MidpointRounding.AwayFromZero);
            UpsertCharge(
                booking,
                BookingChargeType.StayExtension,
                $"Extra night(s) · +{totalExtraNights}",
                quantity: totalExtraNights,
                nights: totalExtraNights,
                unitAmount: nightlyRoomTotal,
                amount: extensionAmount,
                now);
        }
        else if (booking.Charges.Any(c => c.ChargeType == BookingChargeType.StayExtension))
        {
            // Refresh amount if rates/qty changed but nights were not extended this save.
            var existing = booking.Charges.First(c => c.ChargeType == BookingChargeType.StayExtension);
            var nightlyRoomTotal = booking.Items.Sum(line => line.PricePerNight * line.Quantity);
            existing.UnitAmount = nightlyRoomTotal;
            existing.Amount = decimal.Round(nightlyRoomTotal * existing.Quantity, 2, MidpointRounding.AwayFromZero);
            existing.Label = $"Extra night(s) · +{existing.Quantity}";
            existing.Nights = existing.Quantity;
        }
    }

    private void ReplaceIncidentalCharges(
        Booking booking,
        UpdateBookingChargesRequest request,
        DateTime now)
    {
        RemoveChargesOfType(booking, BookingChargeType.Incidental);

        var lines = (request.Incidentals ?? new List<IncidentalLineRequest>())
            .Where(line => line is not null)
            .Select(line => new
            {
                Amount = decimal.Round(Math.Max(0m, line.Amount), 2, MidpointRounding.AwayFromZero),
                Note = string.IsNullOrWhiteSpace(line.Note) ? null : line.Note.Trim()
            })
            .Where(line => line.Amount > 0m)
            .Take(40)
            .ToList();

        if (lines.Count == 0)
        {
            var legacy = decimal.Round(Math.Max(0m, request.IncidentalAmount), 2, MidpointRounding.AwayFromZero);
            if (legacy > 0m)
            {
                var note = string.IsNullOrWhiteSpace(request.IncidentalNote)
                    ? null
                    : request.IncidentalNote.Trim();
                lines.Add(new { Amount = legacy, Note = note });
            }
        }

        foreach (var line in lines)
        {
            var note = line.Note;
            if (note is { Length: > 80 })
            {
                note = note[..80];
            }

            var label = string.IsNullOrWhiteSpace(note)
                ? "Incidental (damage) · cash"
                : $"Incidental (damage) · cash · {note}";

            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.Incidental,
                Label = label,
                Quantity = 1,
                Nights = 1,
                UnitAmount = line.Amount,
                Amount = line.Amount,
                CreatedAtUtc = now
            });
        }
    }

    private void ReplaceSnackBeverageCharges(
        Booking booking,
        UpdateBookingChargesRequest request,
        DateTime now)
    {
        RemoveChargesOfType(booking, BookingChargeType.SnackBeverage);

        var todayIso = DateOnly.FromDateTime(PhilippinesTime.NowManila()).ToString("yyyy-MM-dd");
        var lines = (request.SnackBeverages ?? new List<SnackBeverageLineRequest>())
            .Where(line => line is not null)
            .Select(line => new
            {
                Qty = Math.Max(0, line.Qty),
                Unit = decimal.Round(Math.Max(0m, line.UnitAmount), 2, MidpointRounding.AwayFromZero),
                Product = string.IsNullOrWhiteSpace(line.Product) ? null : line.Product.Trim(),
                TakenDate = NormalizeTakenDate(line.TakenDate) ?? todayIso
            })
            .Where(line => line.Qty > 0 && line.Unit > 0m)
            .Take(40)
            .ToList();

        if (lines.Count == 0)
        {
            var legacyQty = Math.Max(0, request.SnackBeverageQty);
            var legacyUnit = decimal.Round(Math.Max(0m, request.SnackBeverageUnitAmount), 2, MidpointRounding.AwayFromZero);
            if (legacyQty > 0 && legacyUnit > 0m)
            {
                var product = string.IsNullOrWhiteSpace(request.SnackBeverageProduct)
                    ? null
                    : request.SnackBeverageProduct.Trim();
                lines.Add(new
                {
                    Qty = legacyQty,
                    Unit = legacyUnit,
                    Product = product,
                    TakenDate = todayIso
                });
            }
        }

        foreach (var line in lines)
        {
            var product = line.Product;
            if (product is { Length: > 80 })
            {
                product = product[..80];
            }

            var amount = decimal.Round(line.Qty * line.Unit, 2, MidpointRounding.AwayFromZero);
            var takenLabel = FormatTakenDateLabel(line.TakenDate);
            var snackLabel = string.IsNullOrWhiteSpace(product)
                ? $"Snack & beverage · {takenLabel} · {line.Qty} × {line.Unit:N2}"
                : $"Snack & beverage · {product} · {takenLabel} · {line.Qty} × {line.Unit:N2}";

            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.SnackBeverage,
                Label = snackLabel,
                Quantity = line.Qty,
                Nights = 1,
                UnitAmount = line.Unit,
                Amount = amount,
                CreatedAtUtc = now
            });
        }
    }

    private static string? NormalizeTakenDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }

        var text = raw.Trim();
        if (DateOnly.TryParse(text, out var date))
        {
            return date.ToString("yyyy-MM-dd");
        }

        if (DateTime.TryParse(text, out var dt))
        {
            return DateOnly.FromDateTime(PhilippinesTime.ToManila(dt)).ToString("yyyy-MM-dd");
        }

        return null;
    }

    private static string FormatTakenDateLabel(string isoDate)
    {
        if (DateOnly.TryParse(isoDate, out var date))
        {
            return date.ToString("MMM d, yyyy");
        }

        return isoDate;
    }

    private void UpsertCharge(
        Booking booking,
        BookingChargeType type,
        string label,
        int quantity,
        int nights,
        decimal unitAmount,
        decimal amount,
        DateTime now)
    {
        var existing = booking.Charges.FirstOrDefault(c => c.ChargeType == type);
        if (existing == null)
        {
            booking.Charges.Add(new BookingCharge
            {
                ChargeType = type,
                Label = label,
                Quantity = quantity,
                Nights = nights,
                UnitAmount = unitAmount,
                Amount = amount,
                CreatedAtUtc = now
            });
            return;
        }

        existing.Label = label;
        existing.Quantity = quantity;
        existing.Nights = nights;
        existing.UnitAmount = unitAmount;
        existing.Amount = amount;
    }

    private void RemoveChargesOfType(Booking booking, BookingChargeType type)
    {
        var toRemove = booking.Charges.Where(c => c.ChargeType == type).ToList();
        if (toRemove.Count == 0) return;
        _db.BookingCharges.RemoveRange(toRemove);
        foreach (var charge in toRemove)
        {
            booking.Charges.Remove(charge);
        }
    }

    private void RevertStayExtension(Booking booking)
    {
        var existing = booking.Charges.FirstOrDefault(c => c.ChargeType == BookingChargeType.StayExtension);
        var nightsToRevert = existing?.Quantity ?? 0;
        if (nightsToRevert <= 0)
        {
            if (existing != null)
            {
                RemoveChargesOfType(booking, BookingChargeType.StayExtension);
            }

            return;
        }

        var rolledBack = AddManilaCalendarDays(booking.CheckoutTimeUtc, -nightsToRevert);
        var checkInDate = PhilippinesTime.ToManila(booking.CheckInAtUtc).Date;
        var checkoutDate = PhilippinesTime.ToManila(rolledBack).Date;
        if (checkoutDate <= checkInDate)
        {
            throw new ArgumentException(
                "Cannot reverse the stay extension without shortening the stay below one night.");
        }

        booking.CheckoutTimeUtc = rolledBack;
        booking.CheckoutWarningSentAtUtc = null;
        RemoveChargesOfType(booking, BookingChargeType.StayExtension);
    }

    private static DateTime AddManilaCalendarDays(DateTime utcMoment, int days)
    {
        var local = PhilippinesTime.ToManila(utcMoment);
        var shifted = DateTime.SpecifyKind(local.AddDays(days), DateTimeKind.Unspecified);
        return PhilippinesTime.ToUtc(shifted);
    }

    private async Task EnsureBookingItemsAvailableAsync(
        Booking booking,
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        CancellationToken cancellationToken)
    {
        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var capacityByType = capacities.ToDictionary(item => item.RoomTypeId);

        foreach (var line in booking.Items.Where(item => item.RoomTypeId.HasValue))
        {
            var typeId = line.RoomTypeId!.Value;
            if (!capacityByType.TryGetValue(typeId, out var roomType))
            {
                throw new BookingAvailabilityException(
                    "One of the room types on this booking is no longer available.");
            }

            var heldByOthers = await GetHeldQuantityForTypeAsync(
                typeId,
                checkInAtUtc,
                checkoutTimeUtc,
                excludeBookingId: booking.Id,
                cancellationToken);

            if (heldByOthers + line.Quantity > roomType.Capacity)
            {
                var remaining = Math.Max(0, roomType.Capacity - heldByOthers);
                throw new BookingAvailabilityException(
                    $"{roomType.RoomTypeName} has only {remaining} room(s) available for the extended dates.");
            }
        }
    }

    private static void RecalculateTotals(Booking booking)
    {
        var nights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
        var stay = booking.Items.Sum(line => line.PricePerNight * line.Quantity * nights);
        // StayExtension amount is display-only (lodging already includes those nights via dates).
        var fees = booking.Charges
            .Where(charge => charge.ChargeType != BookingChargeType.StayExtension)
            .Sum(charge => charge.Amount);
        booking.TotalAmount = decimal.Round(stay + fees, 2, MidpointRounding.AwayFromZero);
        booking.AmountDueNow = ComputeAmountDueNow(booking.TotalAmount, booking.PaymentOption);
    }

    private static string CreateReference()
    {
        return $"MORI-{Guid.NewGuid():N}"[..15].ToUpperInvariant();
    }

    private static BookingDto MapBooking(Booking booking)
    {
        return new BookingDto(
            booking.Id,
            booking.Reference,
            booking.GuestName,
            booking.GuestEmail,
            booking.GuestPhone,
            booking.CheckInAtUtc,
            booking.CheckoutTimeUtc,
            booking.Kind,
            booking.PaymentOption,
            booking.Status,
            booking.TotalAmount,
            booking.AmountDueNow,
            booking.CreatedAtUtc,
            booking.UpdatedAtUtc,
            booking.IsArchived,
            booking.ArchivedAtUtc,
            booking.Items
                .OrderBy(line => line.RoomTypeName, StringComparer.OrdinalIgnoreCase)
                .Select(line => new BookingItemDto(
                    line.RoomTypeId ?? 0,
                    line.RoomTypeName,
                    line.Quantity,
                    line.PricePerNight,
                    line.RoomType?.MaxOccupancy
                        ?? (StayTimeFees.IsSingleRoomType(0, line.RoomTypeName) ? 1 : 0),
                    (line.AssignedRooms ?? Array.Empty<AssignedRoom>())
                        .OrderBy(assignment => assignment.Room?.RoomNumber ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                        .Select(assignment => new AssignedRoomDto(
                            assignment.RoomId,
                            assignment.Room?.RoomNumber ?? string.Empty))
                        .ToList()))
                .ToList(),
            (booking.Charges ?? Array.Empty<BookingCharge>())
                .OrderBy(charge => charge.ChargeType)
                .ThenBy(charge => charge.Id)
                .Select(charge => new BookingChargeDto(
                    charge.Id,
                    charge.ChargeType,
                    charge.Label,
                    charge.Quantity,
                    charge.Nights,
                    charge.UnitAmount,
                    charge.Amount))
                .ToList());
    }
}

