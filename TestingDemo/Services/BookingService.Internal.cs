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
                    // Vacant dirty â€” receptionist marks Available after cleaning.
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
            .GroupBy(room => new { room.RoomTypeId, room.RoomType.Name, room.RoomType.PricePerNight })
            .Select(group => new RoomTypeCapacity(
                group.Key.RoomTypeId,
                group.Key.Name,
                group.Count(),
                group.Key.PricePerNight))
            .ToListAsync(cancellationToken);
    }

    private async Task<Dictionary<int, int>> GetMaintenanceCountByTypeAsync(
        CancellationToken cancellationToken)
    {
        var counts = await _db.Rooms
            .AsNoTracking()
            .Where(room => room.Status == RoomStatus.Cleaning || room.Status == RoomStatus.Unavailable)
            .GroupBy(room => room.RoomTypeId)
            .Select(group => new { RoomTypeId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return counts.ToDictionary(item => item.RoomTypeId, item => item.Count);
    }

    private async Task<Dictionary<int, int>> GetHeldQuantityByTypeAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        int? excludeBookingId,
        CancellationToken cancellationToken)
    {
        var capacities = await GetPhysicalCapacityByTypeAsync(cancellationToken);
        var maintenanceByType = await GetMaintenanceCountByTypeAsync(cancellationToken);
        var nights = EnumerateStayNights(checkInAtUtc, checkoutTimeUtc);
        var overlapping = await LoadOverlappingBookingLinesAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId,
            cancellationToken);
        var (maxHeld, _) = ComputeNightlyInventory(capacities, maintenanceByType, overlapping, nights);
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
            IReadOnlyDictionary<int, int> maintenanceByType,
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
                var maintenance = maintenanceByType.GetValueOrDefault(capacity.RoomTypeId);
                maxHeldByType[capacity.RoomTypeId] = Math.Max(
                    maxHeldByType.GetValueOrDefault(capacity.RoomTypeId),
                    held);

                if (capacity.Capacity - maintenance - held <= 0)
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
    /// Hotel nights = Manila calendar checkout date âˆ’ check-in date (not elapsed hours).
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
        // Extra person (â‚±200/night) is allowed on every room, one extra guest each.
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
                Label = $"Early check-in (11:30 AM) Â· {rooms} room{(rooms == 1 ? "" : "s")}",
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
                Label = $"Late check-out (+{lateCheckoutHours}h) Â· {rooms} room{(rooms == 1 ? "" : "s")}",
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
                Label = $"Extra person Â· {extraPersons} Ã— {nights} night{(nights == 1 ? "" : "s")}",
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
                $"Extra night(s) Â· +{totalExtraNights}",
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
            existing.Label = $"Extra night(s) Â· +{existing.Quantity}";
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
                ? "Incidental (damage) Â· cash"
                : $"Incidental (damage) Â· cash Â· {note}";

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
                ? $"Snack & beverage Â· {takenLabel} Â· {line.Qty} Ã— {line.Unit:N2}"
                : $"Snack & beverage Â· {product} Â· {takenLabel} Â· {line.Qty} Ã— {line.Unit:N2}";

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
        var availability = await BuildAvailabilityAsync(
            checkInAtUtc,
            checkoutTimeUtc,
            excludeBookingId: booking.Id,
            allowPastCheckIn: true,
            cancellationToken);
        var capacityByType = availability.ToDictionary(item => item.RoomTypeId);

        foreach (var line in booking.Items.Where(item => item.RoomTypeId.HasValue))
        {
            var typeId = line.RoomTypeId!.Value;
            if (!capacityByType.TryGetValue(typeId, out var roomType))
            {
                throw new BookingAvailabilityException(
                    "One of the room types on this booking is no longer available.");
            }

            if (line.Quantity > roomType.Remaining)
            {
                throw new BookingAvailabilityException(
                    $"{roomType.RoomTypeName} has only {roomType.Remaining} room(s) available for the extended dates.");
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
    /// gets that campaign's rate â€” not only the room type of booking.SpecialOfferId.
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
            // Cash-only promo flag without a linked offer id â€” apply any active rate offer per type.
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
                Label = $"Loyalty Coupon Â· {line.RoomTypeName} (âˆ’â‚±{unit:0.##} Â· {cadence})",
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
}
