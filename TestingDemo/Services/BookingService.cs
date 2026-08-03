using System.Data;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class BookingService : IBookingService
{
    private static readonly BookingStatus[] HoldStatuses =
        [BookingStatus.Pending];

    private readonly HotelBookingDbContext _db;

    public BookingService(HotelBookingDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<RoomAvailabilityDto>> GetAvailabilityAsync(
        DateOnly checkIn,
        DateOnly checkOut,
        CancellationToken cancellationToken = default)
    {
        ValidateDates(checkIn, checkOut);

        var capacities = await _db.Rooms
            .AsNoTracking()
            .Where(room => room.Status == RoomStatus.Available)
            .GroupBy(room => new { room.RoomTypeId, room.RoomType.Name })
            .Select(group => new
            {
                group.Key.RoomTypeId,
                RoomTypeName = group.Key.Name,
                Capacity = group.Count(),
                PricePerNight = group.Min(room => room.PricePerNight)
            })
            .ToListAsync(cancellationToken);

        // Confirmed stays occupy physical rooms (Status=Occupied). Only pending holds
        // still reserve capacity against Available inventory.
        var occupied = await _db.BookingItems
            .AsNoTracking()
            .Where(line =>
                !line.Booking.IsArchived
                && HoldStatuses.Contains(line.Booking.Status)
                && line.Booking.CheckIn < checkOut
                && line.Booking.CheckOut > checkIn)
            .GroupBy(line => line.RoomTypeId)
            .Select(group => new
            {
                RoomTypeId = group.Key,
                Quantity = group.Sum(line => line.Quantity)
            })
            .ToDictionaryAsync(item => item.RoomTypeId, item => item.Quantity, cancellationToken);

        return capacities
            .Select(item =>
            {
                occupied.TryGetValue(item.RoomTypeId, out var used);
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
        ValidateDates(request.CheckIn, request.CheckOut);

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
            request.CheckIn,
            request.CheckOut,
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
        var paymentOption = request.PaymentOption;
        var booking = new Booking
        {
            Reference = CreateReference(),
            GuestName = request.GuestName.Trim(),
            GuestEmail = request.GuestEmail.Trim(),
            GuestPhone = request.GuestPhone.Trim(),
            CheckIn = request.CheckIn,
            CheckOut = request.CheckOut,
            PaymentOption = paymentOption,
            Kind = Classify(paymentOption),
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

        var nights = request.CheckOut.DayNumber - request.CheckIn.DayNumber;
        booking.TotalAmount = booking.Items.Sum(
            line => line.PricePerNight * line.Quantity * nights);
        booking.AmountDueNow = ComputeAmountDueNow(booking.TotalAmount, paymentOption);

        _db.Bookings.Add(booking);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        return MapBooking(booking);
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
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
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
            .Include(item => item.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
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
        DateOnly start,
        DateOnly end,
        CancellationToken cancellationToken = default)
    {
        if (end <= start || end.DayNumber - start.DayNumber > 370)
        {
            throw new ArgumentException("Choose a calendar range of one year or less.");
        }

        var stays = await _db.Bookings
            .AsNoTracking()
            .Include(booking => booking.Items)
                .ThenInclude(line => line.AssignedRooms)
                    .ThenInclude(assignment => assignment.Room)
            .Where(booking =>
                !booking.IsArchived
                && booking.Status != BookingStatus.Rejected
                && booking.CheckIn < end
                && booking.CheckOut > start)
            .OrderBy(booking => booking.CheckIn)
            .ThenBy(booking => booking.GuestName)
            .ToListAsync(cancellationToken);

        return stays
            .Select(booking =>
            {
                var paymentLabel = booking.PaymentOption == PaymentOption.Half
                    ? "Half payment"
                    : "Advance booking";
                return new ReservationCalendarEventDto(
                    booking.Id,
                    $"{paymentLabel} · {booking.Reference} · {booking.GuestName}",
                    booking.CheckIn,
                    booking.CheckOut,
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
                    })));
            })
            .ToList();
    }

    public async Task<IReadOnlyList<BookingNotificationDto>> GetRecentNotificationsAsync(
        int limit,
        CancellationToken cancellationToken = default)
    {
        limit = Math.Clamp(limit, 1, 50);
        return await _db.Bookings
            .AsNoTracking()
            .Where(booking => !booking.IsArchived)
            .OrderByDescending(booking => booking.CreatedAtUtc)
            .Take(limit)
            .Select(booking => new BookingNotificationDto(
                booking.Id,
                booking.Reference,
                booking.GuestName,
                booking.Kind,
                booking.Status,
                booking.CheckIn,
                booking.CreatedAtUtc,
                booking.AdminReadAtUtc != null))
            .ToListAsync(cancellationToken);
    }

    public Task<int> GetUnreadCountAsync(CancellationToken cancellationToken = default)
    {
        return _db.Bookings.CountAsync(
            booking => !booking.IsArchived && booking.AdminReadAtUtc == null,
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
        if (booking == null)
        {
            return null;
        }

        if (booking.AdminReadAtUtc == null)
        {
            booking.AdminReadAtUtc = DateTime.UtcNow;
            booking.UpdatedAtUtc = DateTime.UtcNow;
            await _db.SaveChangesAsync(cancellationToken);
        }

        return MapBooking(booking);
    }

    public async Task<IReadOnlyList<AssignableRoomsByTypeDto>> GetAssignableRoomsAsync(
        int bookingId,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
            .FirstOrDefaultAsync(item => item.Id == bookingId, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived || booking.Status != BookingStatus.Pending)
        {
            throw new BookingConcurrencyException("Only pending bookings can be assigned rooms.");
        }

        var typeIds = booking.Items.Select(line => line.RoomTypeId).ToList();
        var rooms = await _db.Rooms
            .AsNoTracking()
            .Where(room => typeIds.Contains(room.RoomTypeId) && room.Status == RoomStatus.Available)
            .OrderBy(room => room.RoomNumber)
            .Select(room => new AssignableRoomDto(
                room.Id,
                room.RoomNumber,
                room.RoomTypeId,
                room.RoomType.Name))
            .ToListAsync(cancellationToken);

        var roomsByType = rooms.GroupBy(room => room.RoomTypeId)
            .ToDictionary(group => group.Key, group => group.ToList());

        return booking.Items
            .OrderBy(line => line.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .Select(line =>
            {
                roomsByType.TryGetValue(line.RoomTypeId, out var options);
                return new AssignableRoomsByTypeDto(
                    line.RoomTypeId,
                    line.RoomTypeName,
                    line.Quantity,
                    options ?? new List<AssignableRoomDto>());
            })
            .ToList();
    }

    public async Task<BookingDto> UpdateStatusAsync(
        int id,
        BookingStatus status,
        string rowVersion,
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

        var suppliedVersion = ParseRowVersion(rowVersion);
        if (!booking.RowVersion.SequenceEqual(suppliedVersion))
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        if (status == BookingStatus.Confirmed)
        {
            await AssignAndOccupyRoomsAsync(booking, assignments, cancellationToken);
        }

        booking.Status = status;
        booking.AdminReadAtUtc ??= DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        _db.Entry(booking).Property(item => item.RowVersion).OriginalValue = suppliedVersion;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> UpdateAsync(
        int id,
        UpdateBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        ValidateDates(request.CheckIn, request.CheckOut);

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
            .FirstOrDefaultAsync(item => item.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("Bookings in history cannot be edited.");
        }

        if (booking.Status == BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException(
                "Confirmed bookings with assigned rooms cannot be edited. Cancel to history first.");
        }

        var suppliedVersion = ParseRowVersion(request.RowVersion);
        if (!booking.RowVersion.SequenceEqual(suppliedVersion))
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        var requestedTypeIds = requestedItems.Select(line => line.RoomTypeId).ToList();
        var roomTypes = await _db.Rooms
            .Where(room => room.Status == RoomStatus.Available
                && requestedTypeIds.Contains(room.RoomTypeId))
            .GroupBy(room => new { room.RoomTypeId, room.RoomType.Name })
            .Select(group => new
            {
                group.Key.RoomTypeId,
                RoomTypeName = group.Key.Name,
                Capacity = group.Count(),
                PricePerNight = group.Min(room => room.PricePerNight)
            })
            .ToDictionaryAsync(item => item.RoomTypeId, cancellationToken);

        foreach (var requested in requestedItems)
        {
            if (!roomTypes.TryGetValue(requested.RoomTypeId, out var roomType))
            {
                throw new BookingAvailabilityException(
                    "One of the selected room types is no longer operationally available.");
            }

            var occupiedByOthers = await _db.BookingItems
                .Where(line =>
                    line.BookingId != booking.Id
                    && line.RoomTypeId == requested.RoomTypeId
                    && !line.Booking.IsArchived
                    && HoldStatuses.Contains(line.Booking.Status)
                    && line.Booking.CheckIn < request.CheckOut
                    && line.Booking.CheckOut > request.CheckIn)
                .SumAsync(line => (int?)line.Quantity, cancellationToken) ?? 0;

            if (occupiedByOthers + requested.Quantity > roomType.Capacity)
            {
                var remaining = Math.Max(0, roomType.Capacity - occupiedByOthers);
                throw new BookingAvailabilityException(
                    $"{roomType.RoomTypeName} has only {remaining} room(s) available for those dates.");
            }
        }

        var requestedByType = requestedItems.ToDictionary(line => line.RoomTypeId);
        foreach (var existing in booking.Items.ToList())
        {
            if (!requestedByType.ContainsKey(existing.RoomTypeId))
            {
                _db.BookingItems.Remove(existing);
                booking.Items.Remove(existing);
            }
        }

        foreach (var requested in requestedItems)
        {
            var roomType = roomTypes[requested.RoomTypeId];
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

        booking.GuestName = request.GuestName.Trim();
        booking.GuestEmail = request.GuestEmail.Trim();
        booking.GuestPhone = request.GuestPhone.Trim();
        booking.CheckIn = request.CheckIn;
        booking.CheckOut = request.CheckOut;
        if (request.PaymentOption.HasValue
            && request.PaymentOption.Value != booking.PaymentOption)
        {
            booking.PaymentOption = request.PaymentOption.Value;
            booking.Kind = Classify(booking.PaymentOption);
        }

        booking.UpdatedAtUtc = DateTime.UtcNow;
        var nights = request.CheckOut.DayNumber - request.CheckIn.DayNumber;
        booking.TotalAmount = booking.Items
            .Where(line => requestedByType.ContainsKey(line.RoomTypeId))
            .Sum(line => line.PricePerNight * line.Quantity * nights);
        booking.AmountDueNow = ComputeAmountDueNow(booking.TotalAmount, booking.PaymentOption);
        _db.Entry(booking).Property(item => item.RowVersion).OriginalValue = suppliedVersion;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> CancelAsync(
        int id,
        string rowVersion,
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

        var suppliedVersion = ParseRowVersion(rowVersion);
        if (!booking.RowVersion.SequenceEqual(suppliedVersion))
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        booking.Status = BookingStatus.Cancelled;
        booking.IsArchived = true;
        booking.ArchivedAtUtc = DateTime.UtcNow;
        booking.AdminReadAtUtc ??= DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        ReleaseAssignedRooms(booking);
        _db.Entry(booking).Property(item => item.RowVersion).OriginalValue = suppliedVersion;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    public async Task<BookingDto> CheckoutAsync(
        int id,
        string rowVersion,
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

        var suppliedVersion = ParseRowVersion(rowVersion);
        if (!booking.RowVersion.SequenceEqual(suppliedVersion))
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        booking.Status = BookingStatus.CheckedOut;
        booking.IsArchived = true;
        booking.ArchivedAtUtc = DateTime.UtcNow;
        booking.AdminReadAtUtc ??= DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        ReleaseAssignedRooms(booking);
        _db.Entry(booking).Property(item => item.RowVersion).OriginalValue = suppliedVersion;

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new BookingConcurrencyException("This booking changed. Refresh and try again.");
        }

        await transaction.CommitAsync(cancellationToken);
        return MapBooking(booking);
    }

    private async Task AssignAndOccupyRoomsAsync(
        Booking booking,
        IReadOnlyList<ConfirmRoomAssignmentRequest>? assignments,
        CancellationToken cancellationToken)
    {
        if (assignments == null || assignments.Count == 0)
        {
            throw new ArgumentException("Assign room numbers before confirming this booking.");
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
            if (!assignmentsByType.TryGetValue(line.RoomTypeId, out var roomIds)
                || roomIds.Count != line.Quantity)
            {
                throw new ArgumentException(
                    $"Select {line.Quantity} available room(s) for {line.RoomTypeName}.");
            }
        }

        if (assignmentsByType.Keys.Except(booking.Items.Select(line => line.RoomTypeId)).Any())
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

        var roomsById = rooms.ToDictionary(room => room.Id);
        foreach (var line in booking.Items)
        {
            var roomIds = assignmentsByType[line.RoomTypeId];
            foreach (var roomId in roomIds)
            {
                var room = roomsById[roomId];
                if (room.RoomTypeId != line.RoomTypeId)
                {
                    throw new ArgumentException(
                        $"Room {room.RoomNumber} is not a {line.RoomTypeName}.");
                }

                if (room.Status != RoomStatus.Available)
                {
                    throw new BookingAvailabilityException(
                        $"Room {room.RoomNumber} is no longer available.");
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
                    assignment.Room.Status = RoomStatus.Available;
                }
            }
        }
    }

    private static byte[] ParseRowVersion(string rowVersion)
    {
        try
        {
            return Convert.FromBase64String(rowVersion);
        }
        catch (FormatException)
        {
            throw new BookingConcurrencyException("The booking version is invalid.");
        }
    }

    private static void ValidateDates(DateOnly checkIn, DateOnly checkOut)
    {
        if (checkIn < DateOnly.FromDateTime(DateTime.Today))
        {
            throw new ArgumentException("Check-in cannot be in the past.");
        }

        if (checkOut <= checkIn)
        {
            throw new ArgumentException("Check-out must be after check-in.");
        }
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
            booking.CheckIn,
            booking.CheckOut,
            booking.Kind,
            booking.PaymentOption,
            booking.Status,
            booking.TotalAmount,
            booking.AmountDueNow,
            booking.CreatedAtUtc,
            booking.UpdatedAtUtc,
            booking.AdminReadAtUtc,
            booking.IsArchived,
            booking.ArchivedAtUtc,
            Convert.ToBase64String(booking.RowVersion),
            booking.Items
                .OrderBy(line => line.RoomTypeName, StringComparer.OrdinalIgnoreCase)
                .Select(line => new BookingItemDto(
                    line.RoomTypeId,
                    line.RoomTypeName,
                    line.Quantity,
                    line.PricePerNight,
                    (line.AssignedRooms ?? Array.Empty<AssignedRoom>())
                        .OrderBy(assignment => assignment.Room?.RoomNumber ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                        .Select(assignment => new AssignedRoomDto(
                            assignment.RoomId,
                            assignment.Room?.RoomNumber ?? string.Empty))
                        .ToList()))
                .ToList());
    }
}
