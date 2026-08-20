using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class CreateWalkInRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateTime CheckInAtUtc { get; set; }
    public DateTime CheckoutTimeUtc { get; set; }
    /// <summary>0 or 1; one extra guest beyond 2 included occupants (₱200/night).</summary>
    public int ExtraPersons { get; set; }
    public List<ConfirmRoomAssignmentRequest> Assignments { get; set; } = new();
}

public sealed class CreateBookingRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateTime CheckInAtUtc { get; set; }
    public DateTime CheckoutTimeUtc { get; set; }
    public PaymentOption PaymentOption { get; set; }
    public bool AcceptTerms { get; set; }
    /// <summary>0 or 1; one extra guest beyond 2 included occupants (₱200/night).</summary>
    public int ExtraPersons { get; set; }
    public List<CreateBookingItemRequest> Items { get; set; } = new();
}

public sealed class UpdateBookingChargesRequest
{
    public bool EarlyCheckIn { get; set; }
    /// <summary>0–3 hours past noon checkout.</summary>
    public int LateCheckoutHours { get; set; }
    /// <summary>0 or 1; one extra guest (₱200/night).</summary>
    public int ExtraPersons { get; set; }

    /// <summary>Damage / incidental amount (₱). 0 clears. Legacy when <see cref="Incidentals"/> is empty.</summary>
    public decimal IncidentalAmount { get; set; }
    public string? IncidentalNote { get; set; }

    /// <summary>
    /// Full incidental/damage cart for this save. Replaces all existing Incidental charges.
    /// Empty list falls back to <see cref="IncidentalAmount"/> / <see cref="IncidentalNote"/>.
    /// </summary>
    public List<IncidentalLineRequest> Incidentals { get; set; } = new();

    /// <summary>Service fee amount (₱). 0 clears.</summary>
    public decimal ServiceFeeAmount { get; set; }

    /// <summary>
    /// Full snack/beverage cart for this save. Replaces all existing SnackBeverage charges.
    /// Empty list clears. Prefer this over the legacy single-line fields below.
    /// </summary>
    public List<SnackBeverageLineRequest> SnackBeverages { get; set; } = new();

    /// <summary>Legacy single snack line (used only when <see cref="SnackBeverages"/> is empty).</summary>
    public int SnackBeverageQty { get; set; }
    public decimal SnackBeverageUnitAmount { get; set; }
    /// <summary>Optional product name (e.g. Bottled water, coffee).</summary>
    public string? SnackBeverageProduct { get; set; }

    /// <summary>Additional nights to append to checkout on this save (0 = no change).</summary>
    public int ExtendStayNights { get; set; }

    /// <summary>
    /// When true, rolls checkout back by the existing StayExtension quantity and removes that charge.
    /// Applied before <see cref="ExtendStayNights"/> so a save can revert then re-extend.
    /// </summary>
    public bool RevertStayExtension { get; set; }
}

public sealed class IncidentalLineRequest
{
    public decimal Amount { get; set; }
    public string? Note { get; set; }
}

public sealed class SnackBeverageLineRequest
{
    public string? Product { get; set; }
    public int Qty { get; set; }
    public decimal UnitAmount { get; set; }
    /// <summary>Manila calendar date the guest took the item (yyyy-MM-dd).</summary>
    public string? TakenDate { get; set; }
}

public sealed class CreateBookingItemRequest
{
    public int RoomTypeId { get; set; }
    public int Quantity { get; set; }
}

public sealed record RoomAvailabilityDto(
    int RoomTypeId,
    string RoomTypeName,
    int Capacity,
    int Remaining,
    decimal PricePerNight);

public sealed record BookingItemDto(
    int RoomTypeId,
    string RoomTypeName,
    int Quantity,
    decimal PricePerNight,
    int MaxOccupancy,
    IReadOnlyList<AssignedRoomDto> AssignedRooms);

public sealed record BookingChargeDto(
    int Id,
    BookingChargeType ChargeType,
    string Label,
    int Quantity,
    int Nights,
    decimal UnitAmount,
    decimal Amount);

public sealed record AssignedRoomDto(
    int RoomId,
    string RoomNumber);

public sealed record BookingDto(
    int Id,
    string Reference,
    string GuestName,
    string GuestEmail,
    string GuestPhone,
    DateTime CheckInAtUtc,
    DateTime CheckoutTimeUtc,
    BookingKind Kind,
    PaymentOption PaymentOption,
    BookingStatus Status,
    decimal TotalAmount,
    decimal AmountDueNow,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    bool IsArchived,
    DateTime? ArchivedAtUtc,
    IReadOnlyList<BookingItemDto> Items,
    IReadOnlyList<BookingChargeDto> Charges);

public sealed record CreateBookingResponse(
    string Reference,
    BookingKind Kind,
    PaymentOption PaymentOption,
    BookingStatus Status,
    decimal TotalAmount,
    decimal AmountDueNow,
    IReadOnlyList<BookingItemDto> Items);

public sealed class UpdateBookingStatusRequest
{
    public BookingStatus Status { get; set; }
    public List<ConfirmRoomAssignmentRequest> Assignments { get; set; } = new();
}

public sealed class ConfirmRoomAssignmentRequest
{
    public int RoomTypeId { get; set; }
    public List<int> RoomIds { get; set; } = new();
}

public sealed record AssignableRoomDto(
    int RoomId,
    string RoomNumber,
    int RoomTypeId,
    string RoomTypeName);

public sealed record AssignableRoomsByTypeDto(
    int RoomTypeId,
    string RoomTypeName,
    int QuantityNeeded,
    IReadOnlyList<AssignableRoomDto> Rooms);

public sealed class BookingVersionRequest
{
}

public sealed class UpdateBookingRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateTime CheckInAtUtc { get; set; }
    public DateTime CheckoutTimeUtc { get; set; }
    public PaymentOption? PaymentOption { get; set; }
    public List<CreateBookingItemRequest> Items { get; set; } = new();
}

public sealed record ReservationCalendarEventDto(
    int Id,
    string Title,
    DateTime Start,
    DateTime End,
    string Reference,
    string GuestName,
    BookingKind Kind,
    PaymentOption PaymentOption,
    BookingStatus Status,
    decimal TotalAmount,
    decimal AmountDueNow,
    string RoomSummary,
    int ExtensionNights = 0);

public sealed record BookingNotificationDto(
    int Id,
    string Reference,
    string GuestName,
    BookingKind Kind,
    BookingStatus Status,
    DateTime CheckInAtUtc,
    DateTime CreatedAtUtc,
    bool IsRead,
    string? Message = null);

public sealed record PagedBookingsDto(
    IReadOnlyList<BookingDto> Items,
    int Page,
    int PageSize,
    int Total);
