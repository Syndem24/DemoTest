using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class CreateWalkInRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateTime CheckInAtUtc { get; set; }
    public DateTime CheckoutTimeUtc { get; set; }
    /// <summary>0 or 1; only allowed when a single room is assigned.</summary>
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
    /// <summary>0 or 1; only allowed when a single room type is booked.</summary>
    public int ExtraPersons { get; set; }
    public List<CreateBookingItemRequest> Items { get; set; } = new();
}

public sealed class UpdateBookingChargesRequest
{
    public bool EarlyCheckIn { get; set; }
    /// <summary>0–3 hours past noon checkout.</summary>
    public int LateCheckoutHours { get; set; }
    /// <summary>0 or 1; single rooms only.</summary>
    public int ExtraPersons { get; set; }
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
    string RoomSummary);

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
