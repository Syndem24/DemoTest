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
                .ThenInclude(line => line.RoomAssignments)
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
                .ThenInclude(line => line.RoomAssignments)
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
            && booking.Items.Any(line => line.RoomAssignments.Count > 0))
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

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
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
            await AssignAndOccupyRoomsAsync(booking, assignments, ct);
        }

        var now = DateTime.UtcNow;
        booking.Status = status;
        booking.UpdatedAtUtc = now;

        // Staff just reviewed this stay â€” clear the bell item so confirm doesn't
        // re-notify the same guest. Only reopen for a new arrival-window alert.
        var reopenNotification = false;
        if (status == BookingStatus.Confirmed
            && booking.ArrivalWarningSentAtUtc == null
            && now >= booking.CheckInAtUtc.AddMinutes(-20)
            && now < booking.CheckInAtUtc)
        {
            booking.ArrivalWarningSentAtUtc = now;
            reopenNotification = true;
        }

        booking.IsNotificationCleared = !reopenNotification;

        AuditBooking(
            booking,
            status == BookingStatus.Confirmed ? "Booking.Confirmed" : "Booking.Rejected",
            status == BookingStatus.Confirmed ? "Booking confirmed." : "Booking rejected.");
        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
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

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException("Confirm the booking before assigning rooms, or confirm with rooms in one step.");
        }

        if (booking.Items.Any(line => line.RoomAssignments.Count > 0))
        {
            throw new BookingConcurrencyException("This booking already has rooms assigned.");
        }

        var paid = await _db.PaymentRecords
            .Where(p => p.BookingId == booking.Id && p.Status == PaymentRecordStatus.Posted)
            .SumAsync(p => (decimal?)p.Amount, ct) ?? 0m;
        var balanceDue = decimal.Round(booking.TotalAmount - paid, 2, MidpointRounding.AwayFromZero);
        if (balanceDue > 0.009m)
        {
            throw new BookingConcurrencyException(
                $"Guest must be fully paid before assigning rooms. Balance due: â‚±{balanceDue:N2}.");
        }

        EnsureRoomAssignmentAllowed(booking);
        await AssignAndOccupyRoomsAsync(booking, assignments, ct);
        // Assigning rooms is a staff action â€” don't re-ping the notification bell.
        booking.IsNotificationCleared = true;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        AuditBooking(booking, "Booking.RoomsAssigned", "Rooms assigned to the stay.");

        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
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

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Charges)
            .Include(item => item.SpecialOffer)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
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

        var hasAssignments = booking.Items.Any(line => line.RoomAssignments.Count > 0);
        ValidateDates(checkInAtUtc, checkoutTimeUtc, allowPastCheckIn: true);

        if (hasAssignments)
        {
            // Hard edit: contact + dates only; keep assigned rooms and quantities.
            if (booking.Status != BookingStatus.Confirmed)
            {
                throw new BookingConcurrencyException(
                    "Rooms are already assigned â€” only confirmed stays can be corrected.");
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
                foreach (var assignment in line.RoomAssignments)
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
            if (requestedItems.Count == 0)
            {
                throw new ArgumentException("At least one room type is required.");
            }

            var availability = await BuildAvailabilityAsync(
                checkInAtUtc,
                checkoutTimeUtc,
                excludeBookingId: booking.Id,
                allowPastCheckIn: true,
                ct);
            var availabilityByType = availability.ToDictionary(item => item.RoomTypeId);

            foreach (var requested in requestedItems)
            {
                if (!availabilityByType.TryGetValue(requested.RoomTypeId, out var slot))
                {
                    throw new BookingAvailabilityException(
                        "One of the selected room types is no longer operationally available.",
                        availability);
                }

                if (requested.Quantity > slot.Remaining)
                {
                    throw new BookingAvailabilityException(
                        $"{slot.RoomTypeName} has only {slot.Remaining} room(s) available for those dates.",
                        availability);
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
                var slot = availabilityByType[requested.RoomTypeId];
                var line = booking.Items.FirstOrDefault(
                    existing => existing.RoomTypeId == requested.RoomTypeId);
                if (line == null)
                {
                    line = new BookingItem { RoomTypeId = requested.RoomTypeId };
                    booking.Items.Add(line);
                }

                line.RoomTypeName = slot.RoomTypeName;
                line.Quantity = requested.Quantity;
                line.PricePerNight = slot.PricePerNight;
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
        ApplyGuestPartyFromRequest(booking, request);
        var early = StayTimeFees.IsEarlyCheckIn(checkInAtUtc);
        var lateHours = StayTimeFees.LateCheckoutHours(checkoutTimeUtc);
        var extraPersons = ResolveExtraPersons(booking, request);
        await ReapplyBookingOfferPricesAsync(booking, ct);
        var typeMeta = await LoadRoomTypeMetaAsync(
            booking.Items.Where(line => line.RoomTypeId.HasValue).Select(line => line.RoomTypeId!.Value),
            ct);
        ReplaceTimeFees(booking, early, lateHours, extraPersons, typeMeta);
        RecalculateTotals(booking);
        AuditBooking(booking, "Booking.Updated", "Stay details updated.");

        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
    }

    private static void ApplyGuestPartyFromRequest(Booking booking, UpdateBookingRequest request)
    {
        var rooms = (request.GuestRooms ?? new List<BookingGuestRoomRequest>())
            .Select(room => new BookingGuestRoomRequest
            {
                Adults = Math.Clamp(room.Adults, 0, 3),
                Children = Math.Clamp(room.Children, 0, 3),
                ExtraPerson = room.ExtraPerson || room.Adults + room.Children > 2
            })
            .Where(room => room.Adults + room.Children > 0)
            .Take(20)
            .ToList();

        if (rooms.Count == 0)
        {
            var adults = Math.Max(0, request.AdultCount);
            var children = Math.Max(0, request.ChildCount);
            if (adults + children > 0)
            {
                var clampedAdults = Math.Min(3, Math.Max(1, adults));
                var clampedChildren = Math.Clamp(children, 0, Math.Max(0, 3 - clampedAdults));
                rooms.Add(new BookingGuestRoomRequest
                {
                    Adults = clampedAdults,
                    Children = clampedChildren
                });
            }
            else
            {
                rooms.Add(new BookingGuestRoomRequest { Adults = 2, Children = 0 });
            }
        }

        WriteGuestParty(
            booking,
            rooms.Select(r => new BookingGuestRoomDto(r.Adults, r.Children, r.ExtraPerson)));
    }

    private static int ResolveExtraPersons(Booking booking, UpdateBookingRequest request)
    {
        var roomCount = Math.Max(RoomCount(booking), request.GuestRooms?.Count ?? 0);
        var maxExtras = StayTimeFees.MaxExtraPersonsForRooms(roomCount);
        if (request.GuestRooms is { Count: > 0 })
        {
            var flagged = request.GuestRooms.Count(room => room.ExtraPerson);
            var fromOccupancy = StayTimeFees.ExtraPersonsFromRooms(
                request.GuestRooms.Select(room => (room.Adults, room.Children)));
            return Math.Clamp(Math.Max(flagged, fromOccupancy), 0, maxExtras);
        }

        return Math.Clamp(request.ExtraPersons, 0, maxExtras);
    }

    private static int ApplyExtraPersonRoomIndexes(Booking booking, UpdateBookingChargesRequest request)
    {
        var party = ParseGuestParty(booking).ToList();
        var slots = Math.Max(RoomCount(booking), Math.Max(1, party.Count));
        while (party.Count < slots)
        {
            party.Add(new BookingGuestRoomDto(2, 0, false));
        }

        var indexes = request.ExtraPersonRoomIndexes ?? new List<int>();
        var extras = indexes.Count > 0 || request.ExtraPersons == 0
            ? indexes.Where(index => index >= 0 && index < party.Count).Distinct().ToList()
            : Enumerable.Range(0, Math.Clamp(request.ExtraPersons, 0, party.Count)).ToList();

        party = party
            .Select((room, index) => room with { ExtraPerson = extras.Contains(index) })
            .ToList();
        WriteGuestParty(booking, party);
        return extras.Count;
    }

    private static void WriteGuestParty(Booking booking, IEnumerable<BookingGuestRoomDto> rooms)
    {
        var list = rooms
            .Where(room => room.Adults + room.Children > 0)
            .Take(20)
            .ToList();
        booking.AdultCount = list.Sum(room => room.Adults);
        booking.ChildCount = list.Sum(room => room.Children);
        booking.GuestPartyJson = System.Text.Json.JsonSerializer.Serialize(
            list.Select(room => new
            {
                adults = room.Adults,
                children = room.Children,
                extraPerson = room.ExtraPerson
            }));
    }

    public async Task<BookingDto> UpdateChargesAsync(
        int id,
        UpdateBookingChargesRequest request,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .Include(item => item.SpecialOffer)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("Bookings in history cannot be edited.");
        }

        if (booking.Status == BookingStatus.Pending)
        {
            var pendingExtras = ApplyExtraPersonRoomIndexes(booking, request);
            var hasEarly = booking.Charges.Any(c => c.ChargeType == BookingChargeType.EarlyCheckIn);
            var lateHours = Math.Clamp(
                booking.Charges.FirstOrDefault(c => c.ChargeType == BookingChargeType.LateCheckout)?.Quantity ?? 0,
                0,
                StayTimeFees.MaxLateCheckoutHours);
            var pendingTypeMeta = await LoadRoomTypeMetaAsync(
                booking.Items.Where(line => line.RoomTypeId.HasValue).Select(line => line.RoomTypeId!.Value),
                ct);
            ReplaceTimeFees(booking, hasEarly, lateHours, pendingExtras, pendingTypeMeta);
            booking.UpdatedAtUtc = DateTime.UtcNow;
            RecalculateTotals(booking);
            AuditBooking(booking, "Booking.ChargesUpdated", "Extra person rooms updated.");
            await _db.SaveChangesAsync(ct);
            return MapBooking(booking);
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException(
                "Confirm the booking before adding stay fees / service charges.");
        }

        var onSpecialOffer = booking.SpecialOfferId is > 0 || booking.CashOnlyPromo;
        var arrivalDiscount = request.ArrivalDiscountRequest;
        if (onSpecialOffer && arrivalDiscount != ArrivalDiscountRequest.None)
        {
            throw new ArgumentException(
                "Senior Citizen / PWD cannot be combined with an active special offer. Clear the promo first, or apply the discount when regular rates resume.");
        }

        if (onSpecialOffer)
            arrivalDiscount = ArrivalDiscountRequest.None;

        booking.ArrivalDiscountRequest = arrivalDiscount;

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
            ct);
        var extraPersons = ApplyExtraPersonRoomIndexes(booking, request);
        ReplaceTimeFees(
            booking,
            request.EarlyCheckIn,
            request.LateCheckoutHours,
            extraPersons,
            typeMeta);
        UpsertReceptionExtras(booking, request, extendNights);
        SyncArrivalDiscountCharge(booking);
        booking.UpdatedAtUtc = DateTime.UtcNow;
        RecalculateTotals(booking);
        AuditBooking(booking, "Booking.ChargesUpdated", "Stay fees or charges updated.");

        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
    }

    public async Task<BookingDto> CancelAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
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
        AuditBooking(booking, "Booking.Cancelled", "Booking cancelled.");

        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
    }

    public async Task<BookingDto> CheckoutAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var booking = await _db.Bookings
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .FirstOrDefaultAsync(item => item.Id == id, ct)
            ?? throw new KeyNotFoundException("Booking was not found.");

        if (booking.IsArchived)
        {
            throw new BookingConcurrencyException("This booking is already in history.");
        }

        if (booking.Status != BookingStatus.Confirmed)
        {
            throw new BookingConcurrencyException("Only confirmed bookings with assigned rooms can be checked out.");
        }

        if (!booking.Items.SelectMany(i => i.RoomAssignments).Any())
        {
            throw new BookingConcurrencyException("Assign rooms before checking out this guest.");
        }

        booking.Status = BookingStatus.CheckedOut;
        booking.IsArchived = true;
        booking.ArchivedAtUtc = DateTime.UtcNow;
        booking.UpdatedAtUtc = DateTime.UtcNow;
        ReleaseAssignedRooms(booking);
        AuditBooking(booking, "Booking.CheckedOut", "Guest checked out.");

        await _db.SaveChangesAsync(ct);
        return MapBooking(booking);
        }, cancellationToken);
    }
}
