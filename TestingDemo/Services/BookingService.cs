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
    private readonly ISystemAuditRecorder _audit;
    private readonly IHttpContextAccessor _http;

    public BookingService(
        HotelBookingDbContext db,
        IWebHostEnvironment environment,
        ISystemAuditRecorder audit,
        IHttpContextAccessor http)
    {
        _db = db;
        _environment = environment;
        _audit = audit;
        _http = http;
    }

    private bool CurrentUserIsGoogleGuest()
    {
        var user = _http.HttpContext?.User;
        return user?.Identity?.IsAuthenticated == true
            && user.IsInRole(AppRoles.Guest);
    }

    private void AuditBooking(
        Booking booking,
        string action,
        string? summary = null,
        string? actorUserId = null,
        string? actorDisplayName = null)
    {
        var label = string.IsNullOrWhiteSpace(booking.Reference)
            ? $"Booking #{booking.Id}"
            : booking.Reference;
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Booking,
            action,
            "Booking",
            booking.Id.ToString(),
            label,
            summary: summary ?? action,
            actorUserId: actorUserId,
            actorDisplayName: actorDisplayName);
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

    public async Task<BookingDto> CreateAsync(
        CreateBookingRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var checkInAtUtc = PhilippinesTime.ToUtc(request.CheckInAtUtc);
        var checkoutTimeUtc = PhilippinesTime.ToUtc(request.CheckoutTimeUtc);
        ValidateDates(checkInAtUtc, checkoutTimeUtc);

        var items = request.Items ?? [];
        if (items.Count == 0)
        {
            throw new ArgumentException("Select at least one room type.");
        }

        var requestedItems = items
            .GroupBy(line => line.RoomTypeId)
            .Select(group => new CreateBookingItemRequest
            {
                RoomTypeId = group.Key,
                Quantity = group.Sum(line => line.Quantity)
            })
            .ToList();

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
            var availability = await GetAvailabilityAsync(
                checkInAtUtc,
                checkoutTimeUtc,
                ct);
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
            var arrivalDiscount = request.ArrivalDiscountRequest;

            SpecialOffer? appliedOffer = null;
            var roomTypeIds = requestedItems.Select(i => i.RoomTypeId).Distinct().ToList();
            var nights = StayNights(checkInAtUtc, checkoutTimeUtc);
            var offersByType = await ResolveActiveOnlineRateOffersAsync(roomTypeIds, nights, ct);

            if (request.SpecialOfferId is > 0)
            {
                appliedOffer = await ResolveOnlineOfferAsync(
                    request.SpecialOfferId.Value,
                    roomTypeIds,
                    nights,
                    ct);
                if (appliedOffer is null)
                {
                    throw new ArgumentException(
                        "That special offer is no longer available for online booking.");
                }

                offersByType[appliedOffer.RoomTypeId] = appliedOffer;
            }
            else if (offersByType.Count > 0)
            {
                // Eligible rate offers replace the sellable rate automatically — no guest choice required.
                appliedOffer = offersByType.Values
                    .OrderBy(o => o.PromoPricePerNight)
                    .First();
            }

            var onLimitedPromo = offersByType.Count > 0;
            if (onLimitedPromo && arrivalDiscount != ArrivalDiscountRequest.None)
            {
                throw new ArgumentException(
                    "Senior Citizen / PWD discount cannot be combined with an active special offer promo.");
            }

            var booking = new Booking
            {
                Reference = CreateReference(),
                GuestName = (request.GuestName ?? string.Empty).Trim(),
                GuestEmail = (request.GuestEmail ?? string.Empty).Trim(),
                GuestPhone = (request.GuestPhone ?? string.Empty).Trim(),
                CheckInAtUtc = checkInAtUtc,
                CheckoutTimeUtc = checkoutTimeUtc,
                PaymentOption = PaymentOption.Full,
                Kind = BookingKind.Booking,
                Status = BookingStatus.Pending,
                Channel = BookingChannel.Online,
                SpecialOfferId = appliedOffer?.Id,
                ArrivalDiscountRequest = arrivalDiscount,
                CashOnlyPromo = offersByType.Values.Any(SpecialOfferService.ForcesCashOnArrival),
                CreatedAtUtc = nowUtc,
                UpdatedAtUtc = nowUtc
            };

            foreach (var requested in requestedItems)
            {
                var roomType = availabilityByType[requested.RoomTypeId];
                var price = roomType.PricePerNight;
                if (offersByType.TryGetValue(requested.RoomTypeId, out var typeOffer)
                    && typeOffer.PromoPricePerNight is decimal promo)
                {
                    price = promo;
                }

                booking.Items.Add(new BookingItem
                {
                    RoomTypeId = requested.RoomTypeId,
                    RoomTypeName = roomType.RoomTypeName,
                    Quantity = requested.Quantity,
                    PricePerNight = price
                });
            }

            var typeMeta = await LoadRoomTypeMetaAsync(
                requestedItems.Select(item => item.RoomTypeId),
                ct);
            ReplaceTimeFees(
                booking,
                StayTimeFees.IsEarlyCheckIn(checkInAtUtc),
                StayTimeFees.LateCheckoutHours(checkoutTimeUtc),
                request.ExtraPersons,
                typeMeta);
            await SyncLoyaltyCouponChargeAsync(booking, requireGoogleGuest: true, ct);
            if (arrivalDiscount != ArrivalDiscountRequest.None
                && (onLimitedPromo
                    || booking.Charges.Any(c => c.ChargeType == BookingChargeType.LoyaltyCoupon)))
            {
                throw new ArgumentException(
                    "Senior Citizen / PWD discount cannot be combined with an active special offer promo.");
            }

            RecalculateTotals(booking);

            _db.Bookings.Add(booking);
            AuditBooking(booking, "Booking.Created", "Online booking created.");
            await _db.SaveChangesAsync(ct);

            booking.SpecialOffer = appliedOffer;
            return MapBooking(booking);
        }, cancellationToken);
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

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var quantityByType = assignments
            .Select(item => (item.RoomTypeId, Quantity: item.RoomIds.Count))
            .ToList();
        await EnsureTypeInventoryAvailableAsync(
            quantityByType,
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: null,
            ct);

        var blockedRoomIds = await GetRoomIdsAssignedOnOverlappingStaysAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: null,
            ct);

        var rooms = await _db.Rooms
            .Include(room => room.RoomType)
            .Where(room => allRoomIds.Contains(room.Id))
            .ToListAsync(ct);

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

        var channel = request.Channel;
        if (channel == BookingChannel.Online)
            channel = BookingChannel.WalkIn;

        var isThirdParty = channel is BookingChannel.Agoda
            or BookingChannel.Expedia
            or BookingChannel.RedDoorz
            or BookingChannel.OtherThirdParty;

        var nights = StayNights(checkInAtUtc, checkoutTimeUtc);
        var offersByType = new Dictionary<int, SpecialOffer>();
        if (!isThirdParty
            && channel is BookingChannel.WalkIn or BookingChannel.FrontDeskExtension)
        {
            foreach (var roomTypeId in assignments.Select(a => a.RoomTypeId).Distinct())
            {
                var offer = await ResolveWalkInOfferAsync(
                    roomTypeId,
                    request.SpecialOfferId,
                    nights,
                    ct);
                if (offer is not null)
                    offersByType[roomTypeId] = offer;
            }
        }

        var appliedOffer = offersByType.Values
            .OrderBy(o => o.PromoPricePerNight)
            .FirstOrDefault();

        var arrivalDiscount = request.ArrivalDiscountRequest;
        if (offersByType.Count > 0 && arrivalDiscount != ArrivalDiscountRequest.None)
        {
            throw new ArgumentException(
                "Senior Citizen / PWD discount cannot be combined with an active walk-in promo. Apply it when regular rates resume, or verify at arrival without promo.");
        }

        var nowUtc = DateTime.UtcNow;
        var booking = new Booking
        {
            Reference = CreateReference(),
            GuestName = (request.GuestName ?? string.Empty).Trim(),
            GuestEmail = (request.GuestEmail ?? string.Empty).Trim(),
            GuestPhone = (request.GuestPhone ?? string.Empty).Trim(),
            CheckInAtUtc = checkInAtUtc,
            CheckoutTimeUtc = checkoutTimeUtc,
            PaymentOption = PaymentOption.Full,
            Kind = BookingKind.Booking,
            Status = BookingStatus.Confirmed,
            Channel = channel,
            SpecialOfferId = appliedOffer?.Id,
            ArrivalDiscountRequest = arrivalDiscount,
            CashOnlyPromo = offersByType.Count > 0,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            IsNotificationCleared = false
        };

        foreach (var assignment in assignments)
        {
            var sample = roomsById[assignment.RoomIds[0]];
            if (sample.RoomType is null)
            {
                throw new ArgumentException(
                    $"Room {sample.RoomNumber} is missing a room type and cannot be booked.");
            }

            var price = sample.RoomType.PricePerNight;
            if (offersByType.TryGetValue(assignment.RoomTypeId, out var typeOffer)
                && typeOffer.PromoPricePerNight is decimal promo)
            {
                price = promo;
            }

            booking.Items.Add(new BookingItem
            {
                RoomTypeId = assignment.RoomTypeId,
                RoomTypeName = sample.RoomType.Name,
                Quantity = assignment.RoomIds.Count,
                PricePerNight = price
            });
        }

        var typeMeta = await LoadRoomTypeMetaAsync(
            assignments.Select(item => item.RoomTypeId),
            ct);
        ReplaceTimeFees(
            booking,
            StayTimeFees.IsEarlyCheckIn(checkInAtUtc),
            StayTimeFees.LateCheckoutHours(checkoutTimeUtc),
            request.ExtraPersons,
            typeMeta);
        SyncArrivalDiscountCharge(booking);
        RecalculateTotals(booking);

        _db.Bookings.Add(booking);
        await _db.SaveChangesAsync(ct);

        await AssignAndOccupyRoomsAsync(booking, assignments, ct);
        AuditBooking(booking, "Booking.WalkInCreated", "Walk-in stay created and rooms assigned.");
        await _db.SaveChangesAsync(ct);

        var saved = await _db.Bookings
            .AsNoTracking()
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomType)
            .Include(item => item.Items)
                .ThenInclude(line => line.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Include(item => item.Charges)
            .FirstAsync(item => item.Id == booking.Id, ct);

        return MapBooking(saved);
        }, cancellationToken);
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
                        var assigned = (line.RoomAssignments ?? Array.Empty<BookingRoomAssignment>())
                            .Select(assignment => assignment.Room?.RoomNumber)
                            .Where(number => !string.IsNullOrWhiteSpace(number))
                            .ToList();
                        return assigned.Count > 0
                            ? $"{line.RoomTypeName}: {string.Join(", ", assigned)}"
                            : $"{line.Quantity}× {line.RoomTypeName}";
                    })),
                    extensionNights,
                    requestedRooms,
                    assignedRooms);
            })
            .ToList();

        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);

        return new ReservationCalendarDto(
            events,
            BuildDailyOccupancy(stays, start, end, capacities));
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
        IReadOnlyList<RoomTypeCapacity> capacities)
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
                    return new DayRoomTypeOccupancyDto(
                        item.RoomTypeName,
                        reserved,
                        occupied,
                        Math.Max(0, item.Capacity - occupied),
                        item.Capacity);
                })
                .OrderBy(item => item.RoomTypeName, StringComparer.OrdinalIgnoreCase)
                .ToList();

            var occupiedTotal = occupiedByType.Values.Sum();
            var reservedTotal = reservedByType.Values.Sum();
            days.Add(new DayRoomOccupancyDto(
                cursor.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                reservedTotal,
                occupiedTotal,
                Math.Max(0, capacityTotal - occupiedTotal),
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
        // Past scheduled check-in only — never cancel before arrival time.
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

        // Staff just reviewed this stay — clear the bell item so confirm doesn't
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
                $"Guest must be fully paid before assigning rooms. Balance due: ₱{balanceDue:N2}.");
        }

        EnsureRoomAssignmentAllowed(booking);
        await AssignAndOccupyRoomsAsync(booking, assignments, ct);
        // Assigning rooms is a staff action — don't re-ping the notification bell.
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

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var archived = await _db.Bookings
            .Include(booking => booking.Items)
                .ThenInclude(item => item.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(booking => booking.IsArchived)
            .OrderByDescending(booking => booking.ArchivedAtUtc ?? booking.UpdatedAtUtc)
            .ToListAsync(ct);

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

        var log = new SystemFlushLog
        {
            Kind = SystemFlushKind.BookingHistory,
            FlushedAtUtc = flushedAtUtc,
            PerformedBy = performedBy,
            RecordCount = archived.Count,
            FileName = fileName,
            Summary = summary.Length > 2000 ? summary[..2000] : summary
        };
        _db.SystemFlushLogs.Add(log);
        _audit.Record(
            SystemAuditIntent.FileModification,
            SystemAuditDomain.File,
            "Booking.FlushExport",
            "Flush",
            fileName,
            fileName,
            summary: $"{archived.Count} archived stay(s) exported to {fileName}, then deleted.");

        await _db.SaveChangesAsync(ct);

        return new FlushBookingHistoryResult(
            pdfBytes,
            fileName,
            MapHistoryFlushLog(log));
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<BookingHistoryFlushLogDto>> GetHistoryFlushLogsAsync(
        CancellationToken cancellationToken = default)
    {
        await PurgeExpiredHistoryFlushLogsAsync(cancellationToken);

        return await _db.SystemFlushLogs
            .AsNoTracking()
            .Where(log => log.Kind == SystemFlushKind.BookingHistory)
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
        var expired = await _db.SystemFlushLogs
            .Where(log => log.Kind == SystemFlushKind.BookingHistory && log.FlushedAtUtc < cutoff)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
        {
            return;
        }

        _db.SystemFlushLogs.RemoveRange(expired);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static BookingHistoryFlushLogDto MapHistoryFlushLog(SystemFlushLog log)
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
            .Include(room => room.RoomType)
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
                line.RoomAssignments.Add(new BookingRoomAssignment
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
            foreach (var assignment in line.RoomAssignments)
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
        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var nights = EnumerateStayNights(checkInAtUtc, checkoutTimeUtc);
        var overlapping = await LoadOverlappingBookingLinesAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);
        var (maxHeld, _) = ComputeNightlyInventory(capacities, overlapping, nights);
        return maxHeld;
    }

    private async Task<Dictionary<int, bool>> ComputeExceedsInventoryFlagsAsync(
        IReadOnlyList<Booking> bookings,
        CancellationToken cancellationToken)
    {
        var flags = new Dictionary<int, bool>();
        foreach (var booking in bookings)
        {
            if (booking.IsArchived
                || booking.Status is not (BookingStatus.Pending or BookingStatus.Confirmed))
            {
                continue;
            }

            var availability = await GetAvailabilityForBookingAsync(
                booking.Id,
                booking.CheckInAtUtc,
                booking.CheckoutTimeUtc,
                cancellationToken);
            var byType = availability.ToDictionary(item => item.RoomTypeId);
            foreach (var line in booking.Items)
            {
                var typeId = line.RoomTypeId ?? 0;
                if (typeId <= 0)
                {
                    continue;
                }

                if (!byType.TryGetValue(typeId, out var roomType))
                {
                    flags[booking.Id] = true;
                    break;
                }

                if (line.Quantity > roomType.Remaining)
                {
                    flags[booking.Id] = true;
                    break;
                }
            }
        }

        return flags;
    }

    private sealed record OverlappingBookingLine(
        int RoomTypeId,
        int Quantity,
        DateTime CheckInAtUtc,
        DateTime CheckoutTimeUtc);

    private sealed record StayNightSlice(
        DateTime NightStartUtc,
        DateTime NightEndUtc,
        DateOnly ManilaDate);

    private static List<StayNightSlice> EnumerateStayNights(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc)
    {
        var checkInDate = PhilippinesTime.ToManila(checkInAtUtc).Date;
        var checkoutDate = PhilippinesTime.ToManila(checkoutTimeUtc).Date;
        var nightCount = Math.Max(1, (checkoutDate - checkInDate).Days);
        var nights = new List<StayNightSlice>(nightCount);
        for (var i = 0; i < nightCount; i++)
        {
            var manilaDate = checkInDate.AddDays(i);
            nights.Add(new StayNightSlice(
                PhilippinesTime.ToUtc(manilaDate),
                PhilippinesTime.ToUtc(manilaDate.AddDays(1)),
                DateOnly.FromDateTime(manilaDate)));
        }

        return nights;
    }

    private async Task<List<OverlappingBookingLine>> LoadOverlappingBookingLinesAsync(
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
            .Select(line => new OverlappingBookingLine(
                line.RoomTypeId!.Value,
                line.Quantity,
                line.Booking.CheckInAtUtc,
                line.Booking.CheckoutTimeUtc))
            .ToListAsync(cancellationToken);
    }

    private static (Dictionary<int, int> MaxHeldByType, Dictionary<int, List<string>> SoldOutDatesByType)
        ComputeNightlyInventory(
            IReadOnlyList<RoomTypeCapacity> capacities,
            IReadOnlyList<OverlappingBookingLine> overlapping,
            IReadOnlyList<StayNightSlice> nights)
    {
        var maxHeldByType = new Dictionary<int, int>();
        var soldOutDatesByType = capacities.ToDictionary(
            item => item.RoomTypeId,
            _ => new List<string>());

        foreach (var night in nights)
        {
            var heldThisNight = new Dictionary<int, int>();
            foreach (var line in overlapping)
            {
                if (line.CheckInAtUtc < night.NightEndUtc && line.CheckoutTimeUtc > night.NightStartUtc)
                {
                    heldThisNight[line.RoomTypeId] =
                        heldThisNight.GetValueOrDefault(line.RoomTypeId) + line.Quantity;
                }
            }

            foreach (var capacity in capacities)
            {
                var held = heldThisNight.GetValueOrDefault(capacity.RoomTypeId);
                maxHeldByType[capacity.RoomTypeId] = Math.Max(
                    maxHeldByType.GetValueOrDefault(capacity.RoomTypeId),
                    held);

                if (capacity.Capacity - held <= 0)
                {
                    soldOutDatesByType[capacity.RoomTypeId].Add(
                        night.ManilaDate.ToString("yyyy-MM-dd"));
                }
            }
        }

        return (maxHeldByType, soldOutDatesByType);
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

        var availability = await BuildAvailabilityAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            allowPastCheckIn: excludeBookingId.HasValue,
            cancellationToken);
        var availabilityByType = availability.ToDictionary(item => item.RoomTypeId);

        foreach (var group in requested.GroupBy(item => item.RoomTypeId))
        {
            var quantity = group.Sum(item => item.Quantity);
            if (!availabilityByType.TryGetValue(group.Key, out var slot))
            {
                throw new BookingAvailabilityException(
                    "One of the selected room types is no longer available.",
                    availability);
            }

            if (quantity > slot.Remaining)
            {
                throw new BookingAvailabilityException(
                    $"{slot.RoomTypeName} has only {slot.Remaining} room(s) available for those dates.",
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
        var query = _db.BookingRoomAssignments
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

    private const int MaxStayNights = 365;

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

        var nights = (PhilippinesTime.ToManila(checkoutTimeUtc).Date
            - PhilippinesTime.ToManila(checkInAtUtc).Date).Days;
        if (nights > MaxStayNights)
        {
            throw new ArgumentException($"Stay cannot exceed {MaxStayNights} nights.");
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
        // Extra person (₱200/night) is allowed on every room, one extra guest each.
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
        var rooms = RoomCount(booking);
        extraPersons = Math.Clamp(extraPersons, 0, StayTimeFees.MaxExtraPersonsForRooms(rooms));
        if (!BookingAllowsExtraPerson(booking, typeMeta))
        {
            extraPersons = 0;
        }

        var checkInLocal = PhilippinesTime.ToManila(booking.CheckInAtUtc);
        var preservedCheckInTime = new TimeSpan(
            checkInLocal.Hour,
            checkInLocal.Minute,
            0);
        var checkInTime = earlyCheckIn
            ? StayTimeFees.EarlyCheckInTime
            : (preservedCheckInTime >= StayTimeFees.DefaultCheckInTime
                ? preservedCheckInTime
                : StayTimeFees.DefaultCheckInTime);

        booking.CheckInAtUtc = StayTimeFees.WithManilaTimeOfDay(
            booking.CheckInAtUtc,
            checkInTime);
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

    private void SyncArrivalDiscountCharge(Booking booking)
    {
        RemoveChargesOfType(booking, BookingChargeType.ArrivalDiscount);

        if (booking.ArrivalDiscountRequest == ArrivalDiscountRequest.None
            || booking.Channel != BookingChannel.WalkIn
            || booking.SpecialOfferId is > 0
            || booking.CashOnlyPromo)
        {
            return;
        }

        var nights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
        var stay = booking.Items.Sum(line => line.PricePerNight * line.Quantity * nights);
        if (stay <= 0)
        {
            return;
        }

        var discount = decimal.Round(stay * 0.2m, 2, MidpointRounding.AwayFromZero);
        if (discount <= 0)
        {
            return;
        }

        var label = booking.ArrivalDiscountRequest == ArrivalDiscountRequest.SeniorCitizen
            ? "Senior Citizen discount (20%)"
            : "PWD discount (20%)";

        booking.Charges.Add(new BookingCharge
        {
            ChargeType = BookingChargeType.ArrivalDiscount,
            Label = label,
            Quantity = 1,
            Nights = nights,
            UnitAmount = -discount,
            Amount = -discount,
            CreatedAtUtc = DateTime.UtcNow,
        });
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
        var guestRooms = ParseGuestParty(booking);
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
                    (line.RoomAssignments ?? Array.Empty<BookingRoomAssignment>())
                        .OrderBy(assignment => assignment.Room?.RoomNumber ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                        .Select(assignment => new AssignedRoomDto(
                            assignment.RoomId,
                            assignment.Room?.RoomNumber ?? string.Empty))
                        .ToList(),
                    RegularPricePerNight: line.RoomType?.PricePerNight is decimal list
                        && list > line.PricePerNight
                        ? list
                        : null))
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
                .ToList(),
            booking.Channel,
            booking.SpecialOfferId,
            booking.ArrivalDiscountRequest,
            booking.CashOnlyPromo,
            booking.SpecialOffer?.Title,
            booking.SpecialOffer?.RegularPricePerNight,
            ExceedsAvailableInventory: false,
            AdultCount: booking.AdultCount > 0 || booking.ChildCount > 0
                ? booking.AdultCount
                : guestRooms.Sum(r => r.Adults),
            ChildCount: booking.AdultCount > 0 || booking.ChildCount > 0
                ? booking.ChildCount
                : guestRooms.Sum(r => r.Children),
            GuestRooms: guestRooms);
    }

    private static IReadOnlyList<BookingGuestRoomDto> ParseGuestParty(Booking booking)
    {
        if (!string.IsNullOrWhiteSpace(booking.GuestPartyJson))
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(booking.GuestPartyJson);
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                {
                    var list = new List<BookingGuestRoomDto>();
                    foreach (var el in doc.RootElement.EnumerateArray())
                    {
                        var adults = el.TryGetProperty("adults", out var a) ? a.GetInt32()
                            : el.TryGetProperty("Adults", out var a2) ? a2.GetInt32() : 0;
                        var children = el.TryGetProperty("children", out var c) ? c.GetInt32()
                            : el.TryGetProperty("Children", out var c2) ? c2.GetInt32() : 0;
                        var hasExtraFlag = el.TryGetProperty("extraPerson", out var extraEl)
                            || el.TryGetProperty("ExtraPerson", out extraEl);
                        var extra = hasExtraFlag
                            ? extraEl.ValueKind == System.Text.Json.JsonValueKind.True
                            : adults + children > StayTimeFees.IncludedGuestsPerRoom;
                        if (adults + children > 0)
                            list.Add(new BookingGuestRoomDto(
                                Math.Clamp(adults, 0, 3),
                                Math.Clamp(children, 0, 3),
                                extra));
                    }
                    if (list.Count > 0) return list;
                }
            }
            catch
            {
                // Fall through to totals / defaults.
            }
        }

        if (booking.AdultCount > 0 || booking.ChildCount > 0)
        {
            return new[]
            {
                new BookingGuestRoomDto(
                    Math.Max(1, Math.Min(3, booking.AdultCount)),
                    Math.Clamp(booking.ChildCount, 0, Math.Max(0, 3 - Math.Max(1, Math.Min(3, booking.AdultCount)))))
            };
        }

        return Array.Empty<BookingGuestRoomDto>();
    }

    private async Task<SpecialOffer?> ResolveWalkInOfferAsync(
        int roomTypeId,
        int? requestedOfferId,
        int nights,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        IQueryable<SpecialOffer> query = _db.SpecialOffers
            .Where(o => o.RoomTypeId == roomTypeId
                && o.IsActive
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && o.PromoPricePerNight != null
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore)
                && (o.Channels & SpecialOfferChannels.WalkIn) != 0);

        if (requestedOfferId is > 0)
            query = query.Where(o => o.Id == requestedOfferId);

        var candidates = await query
            .OrderBy(o => o.PromoPricePerNight)
            .ToListAsync(cancellationToken);

        return candidates.FirstOrDefault(o => SpecialOfferService.IsEligibleForStay(o, nights));
    }

    /// <summary>
    /// Restores promo nightly rates after admin edits that reset lines to list price.
    /// Uses sibling campaign rows (same title/kind/window) so every room type on the stay
    /// gets that campaign's rate — not only the room type of booking.SpecialOfferId.
    /// </summary>
    private async Task ReapplyBookingOfferPricesAsync(
        Booking booking,
        CancellationToken cancellationToken)
    {
        if (booking.SpecialOfferId is not > 0 && !booking.CashOnlyPromo)
        {
            await SyncLoyaltyCouponChargeAsync(booking, requireGoogleGuest: false, cancellationToken);
            return;
        }

        SpecialOffer? offer = booking.SpecialOffer;
        if (offer is null && booking.SpecialOfferId is int offerId)
        {
            offer = await _db.SpecialOffers
                .AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == offerId, cancellationToken);
        }

        var nights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
        var now = DateTime.UtcNow;

        Dictionary<int, SpecialOffer> promoByType;
        if (offer is not null)
        {
            if (!offer.IsActive
                || offer.StartsAtUtc > now
                || offer.EndsAtUtc < now
                || !SpecialOfferService.IsEligibleForStay(offer, nights))
            {
                await SyncLoyaltyCouponChargeAsync(booking, requireGoogleGuest: false, cancellationToken);
                return;
            }

            var siblings = await _db.SpecialOffers
                .AsNoTracking()
                .Where(o => o.Title == offer.Title
                    && o.Kind == offer.Kind
                    && o.StartsAtUtc == offer.StartsAtUtc
                    && o.EndsAtUtc == offer.EndsAtUtc
                    && o.IsActive
                    && o.PromoPricePerNight != null
                    && o.PromoPricePerNight > 0)
                .ToListAsync(cancellationToken);

            promoByType = siblings
                .Where(o => SpecialOfferService.IsEligibleForStay(o, nights))
                .GroupBy(o => o.RoomTypeId)
                .ToDictionary(
                    g => g.Key,
                    g => g.OrderBy(o => o.PromoPricePerNight).First());

            booking.CashOnlyPromo = offer.CashOnly || siblings.Any(s => s.CashOnly);
        }
        else
        {
            // Cash-only promo flag without a linked offer id — apply any active rate offer per type.
            var typeIds = booking.Items
                .Where(line => line.RoomTypeId.HasValue)
                .Select(line => line.RoomTypeId!.Value)
                .Distinct()
                .ToList();
            promoByType = await ResolveActiveOnlineRateOffersAsync(typeIds, nights, cancellationToken);
        }

        foreach (var line in booking.Items)
        {
            if (line.RoomTypeId is int roomTypeId
                && promoByType.TryGetValue(roomTypeId, out var typeOffer)
                && typeOffer.PromoPricePerNight is decimal promo
                && promo > 0)
            {
                line.PricePerNight = promo;
            }
        }

        await SyncLoyaltyCouponChargeAsync(booking, requireGoogleGuest: false, cancellationToken);
    }

    private async Task SyncLoyaltyCouponChargeAsync(
        Booking booking,
        bool requireGoogleGuest,
        CancellationToken cancellationToken)
    {
        var hadCoupon = booking.Charges.Any(c => c.ChargeType == BookingChargeType.LoyaltyCoupon);
        RemoveChargesOfType(booking, BookingChargeType.LoyaltyCoupon);

        if (booking.Channel != BookingChannel.Online)
            return;
        if (requireGoogleGuest && !CurrentUserIsGoogleGuest())
            return;
        if (!requireGoogleGuest && !hadCoupon && !CurrentUserIsGoogleGuest())
            return;

        var typeIds = booking.Items
            .Where(line => line.RoomTypeId is > 0)
            .Select(line => line.RoomTypeId!.Value)
            .Distinct()
            .ToList();
        if (typeIds.Count == 0)
            return;

        var now = DateTime.UtcNow;
        var offers = await _db.SpecialOffers
            .AsNoTracking()
            .Where(o => typeIds.Contains(o.RoomTypeId)
                && o.IsActive
                && o.Kind == SpecialOfferKind.GoogleLoyalty
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && o.PromoPricePerNight != null
                && (o.Channels & SpecialOfferChannels.OnlineVisible) != 0)
            .ToListAsync(cancellationToken);
        if (offers.Count == 0)
            return;

        var nights = StayNights(booking.CheckInAtUtc, booking.CheckoutTimeUtc);
        var prior = false;
        if (offers.Any(o => o.LoyaltyApplyMode == LoyaltyApplyMode.FirstBooking))
        {
            prior = await GuestHasPriorOnlineBookingAsync(
                booking.GuestEmail,
                booking.Id > 0 ? booking.Id : null,
                cancellationToken);
        }

        foreach (var line in booking.Items)
        {
            if (line.RoomTypeId is not int roomTypeId)
                continue;
            var offer = offers.FirstOrDefault(o => o.RoomTypeId == roomTypeId);
            if (offer is null)
                continue;
            if (offer.LoyaltyApplyMode == LoyaltyApplyMode.FirstBooking && prior)
                continue;

            var unit = SpecialOfferService.LoyaltyCouponAmount(offer);
            if (unit <= 0)
                continue;
            var units = SpecialOfferService.LoyaltyCouponUnits(offer.LoyaltyApplyMode, nights);
            var qty = Math.Max(1, line.Quantity);
            var deduct = decimal.Round(unit * units * qty, 2, MidpointRounding.AwayFromZero);
            var stayLine = decimal.Round(line.PricePerNight * qty * Math.Max(1, nights), 2);
            if (deduct > stayLine)
                deduct = stayLine;
            if (deduct <= 0)
                continue;

            var cadence = SpecialOfferService.LoyaltyApplyModeLabel(offer.LoyaltyApplyMode);
            booking.Charges.Add(new BookingCharge
            {
                ChargeType = BookingChargeType.LoyaltyCoupon,
                Label = $"Loyalty Coupon · {line.RoomTypeName} (−₱{unit:0.##} · {cadence})",
                Quantity = qty,
                Nights = units,
                UnitAmount = -unit,
                Amount = -deduct,
                CreatedAtUtc = DateTime.UtcNow
            });
        }
    }

    private async Task<bool> GuestHasPriorOnlineBookingAsync(
        string email,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        var normalized = (email ?? string.Empty).Trim();
        if (normalized.Length == 0)
            return false;

        var query = _db.Bookings.AsNoTracking()
            .Where(b => b.Channel == BookingChannel.Online
                && b.Status != BookingStatus.Cancelled
                && b.GuestEmail == normalized);
        if (excludeBookingId is int id)
            query = query.Where(b => b.Id != id);
        return await query.AnyAsync(cancellationToken);
    }

    private async Task<Dictionary<int, SpecialOffer>> ResolveActiveOnlineRateOffersAsync(
        IReadOnlyList<int> roomTypeIds,
        int nights,
        CancellationToken cancellationToken)
    {
        if (roomTypeIds.Count == 0)
            return new Dictionary<int, SpecialOffer>();

        var now = DateTime.UtcNow;
        var offers = await _db.SpecialOffers
            .AsNoTracking()
            .Where(o => roomTypeIds.Contains(o.RoomTypeId)
                && o.IsActive
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && o.PromoPricePerNight != null
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore)
                && (o.Channels & SpecialOfferChannels.OnlineVisible) != 0)
            .OrderBy(o => o.PromoPricePerNight)
            .ToListAsync(cancellationToken);

        return offers
            .Where(o => SpecialOfferService.IsEligibleForStay(o, nights))
            .GroupBy(o => o.RoomTypeId)
            .ToDictionary(g => g.Key, g => g.First());
    }

    private async Task<SpecialOffer?> ResolveOnlineOfferAsync(
        int offerId,
        IReadOnlyList<int> roomTypeIds,
        int nights,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var offer = await _db.SpecialOffers
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == offerId, cancellationToken);
        if (offer is null) return null;
        if (!offer.IsActive || offer.StartsAtUtc > now || offer.EndsAtUtc < now) return null;
        if ((offer.Channels & SpecialOfferChannels.OnlineVisible) == 0) return null;
        if (offer.Kind is not (SpecialOfferKind.LimitedTime or SpecialOfferKind.StayLongerSaveMore)
            || offer.PromoPricePerNight is null)
            return null;
        if (!SpecialOfferService.IsEligibleForStay(offer, nights)) return null;
        if (!roomTypeIds.Contains(offer.RoomTypeId)) return null;
        return offer;
    }

    private Task ExecuteInSerializableTransactionAsync(
        Func<CancellationToken, Task> action,
        CancellationToken cancellationToken)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        return strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);
            await action(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        });
    }

    private async Task<T> ExecuteInSerializableTransactionAsync<T>(
        Func<CancellationToken, Task<T>> action,
        CancellationToken cancellationToken)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);
            var result = await action(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        });
    }
}

