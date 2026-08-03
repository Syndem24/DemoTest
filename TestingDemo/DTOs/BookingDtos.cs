using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class CreateBookingRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateOnly CheckIn { get; set; }
    public DateOnly CheckOut { get; set; }
    public PaymentOption PaymentOption { get; set; }
    public bool AcceptTerms { get; set; }
    public List<CreateBookingItemRequest> Items { get; set; } = new();
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
    IReadOnlyList<AssignedRoomDto> AssignedRooms);

public sealed record AssignedRoomDto(
    int RoomId,
    string RoomNumber);

public sealed record BookingDto(
    int Id,
    string Reference,
    string GuestName,
    string GuestEmail,
    string GuestPhone,
    DateOnly CheckIn,
    DateOnly CheckOut,
    BookingKind Kind,
    PaymentOption PaymentOption,
    BookingStatus Status,
    decimal TotalAmount,
    decimal AmountDueNow,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DateTime? AdminReadAtUtc,
    bool IsArchived,
    DateTime? ArchivedAtUtc,
    string RowVersion,
    IReadOnlyList<BookingItemDto> Items);

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
    public string RowVersion { get; set; } = string.Empty;
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
    public string RowVersion { get; set; } = string.Empty;
}

public sealed class UpdateBookingRequest
{
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateOnly CheckIn { get; set; }
    public DateOnly CheckOut { get; set; }
    public PaymentOption? PaymentOption { get; set; }
    public string RowVersion { get; set; } = string.Empty;
    public List<CreateBookingItemRequest> Items { get; set; } = new();
}

public sealed record ReservationCalendarEventDto(
    int Id,
    string Title,
    DateOnly Start,
    DateOnly End,
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
    DateOnly CheckIn,
    DateTime CreatedAtUtc,
    bool IsRead);

public sealed record PagedBookingsDto(
    IReadOnlyList<BookingDto> Items,
    int Page,
    int PageSize,
    int Total);
