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
                // Eligible rate offers replace the sellable rate automatically â€” no guest choice required.
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

        // Named OTAs (Agoda, Expedia, RedDoorz) are always excluded from walk-in promos —
        // their rates are managed by the OTA platform itself.
        // OtherThirdParty is excluded by default but staff may opt in by selecting a SpecialOfferId.
        var isThirdParty = channel is BookingChannel.Agoda
            or BookingChannel.Expedia
            or BookingChannel.RedDoorz
            || (channel is BookingChannel.OtherThirdParty && request.SpecialOfferId is null);

        var nights = StayNights(checkInAtUtc, checkoutTimeUtc);
        var offersByType = new Dictionary<int, SpecialOffer>();
        if (!isThirdParty
            && channel is BookingChannel.WalkIn
                or BookingChannel.FrontDeskExtension
                or BookingChannel.OtherThirdParty)
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
}
