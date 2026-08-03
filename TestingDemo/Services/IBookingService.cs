using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IBookingService
{
    Task<IReadOnlyList<RoomAvailabilityDto>> GetAvailabilityAsync(
        DateOnly checkIn,
        DateOnly checkOut,
        CancellationToken cancellationToken = default);

    Task<BookingDto> CreateAsync(
        CreateBookingRequest request,
        CancellationToken cancellationToken = default);

    Task<PagedBookingsDto> GetPagedAsync(
        BookingStatus? status,
        string? search,
        bool history,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<BookingDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<BookingDto?> GetActiveStayByRoomIdAsync(
        int roomId,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyDictionary<int, BookingDto>> GetActiveStaysByRoomIdsAsync(
        IEnumerable<int> roomIds,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ReservationCalendarEventDto>> GetReservationCalendarAsync(
        DateOnly start,
        DateOnly end,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingNotificationDto>> GetRecentNotificationsAsync(
        int limit,
        CancellationToken cancellationToken = default);
    Task<int> GetUnreadCountAsync(CancellationToken cancellationToken = default);
    Task<BookingDto?> MarkReadAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AssignableRoomsByTypeDto>> GetAssignableRoomsAsync(
        int bookingId,
        CancellationToken cancellationToken = default);
    Task<BookingDto> UpdateStatusAsync(
        int id,
        BookingStatus status,
        string rowVersion,
        IReadOnlyList<ConfirmRoomAssignmentRequest>? assignments = null,
        CancellationToken cancellationToken = default);
    Task<BookingDto> UpdateAsync(
        int id,
        UpdateBookingRequest request,
        CancellationToken cancellationToken = default);
    Task<BookingDto> CancelAsync(
        int id,
        string rowVersion,
        CancellationToken cancellationToken = default);
    Task<BookingDto> CheckoutAsync(
        int id,
        string rowVersion,
        CancellationToken cancellationToken = default);
}

public sealed class BookingAvailabilityException : Exception
{
    public BookingAvailabilityException(
        string message,
        IReadOnlyList<RoomAvailabilityDto>? availability = null)
        : base(message)
    {
        Availability = availability ?? Array.Empty<RoomAvailabilityDto>();
    }

    public IReadOnlyList<RoomAvailabilityDto> Availability { get; }
}

public sealed class BookingConcurrencyException : Exception
{
    public BookingConcurrencyException(string message) : base(message)
    {
    }
}
