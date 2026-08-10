using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IBookingService
{
    Task<IReadOnlyList<RoomAvailabilityDto>> GetAvailabilityAsync(
        DateTime checkInAtUtc,
        DateTime checkoutTimeUtc,
        CancellationToken cancellationToken = default);

    Task<BookingDto> CreateAsync(
        CreateBookingRequest request,
        CancellationToken cancellationToken = default);

    Task<BookingDto> CreateWalkInAsync(
        CreateWalkInRequest request,
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
        DateTime start,
        DateTime end,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingNotificationDto>> GetRecentNotificationsAsync(
        int limit,
        CancellationToken cancellationToken = default);
    Task<int> GetUnreadCountAsync(CancellationToken cancellationToken = default);
    Task<BookingDto?> MarkReadAsync(int id, CancellationToken cancellationToken = default);
    Task MarkAllAsReadAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> AutoCheckoutExpiredBookingsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> ProcessCheckoutWarningsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> ProcessArrivalWarningsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> ProcessPendingCallWarningsAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> GetArrivingSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> GetPendingCallsSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> GetCheckoutsSoonAsync(
        int windowMinutes = 20,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<BookingDto>> AutoCancelExpiredPendingAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AssignableRoomsByTypeDto>> GetAssignableRoomsAsync(
        int bookingId,
        CancellationToken cancellationToken = default);
    Task<BookingDto> UpdateStatusAsync(
        int id,
        BookingStatus status,
        IReadOnlyList<ConfirmRoomAssignmentRequest>? assignments = null,
        CancellationToken cancellationToken = default);
    Task<BookingDto> AssignRoomsAsync(
        int id,
        IReadOnlyList<ConfirmRoomAssignmentRequest> assignments,
        CancellationToken cancellationToken = default);
    Task<BookingDto> UpdateAsync(
        int id,
        UpdateBookingRequest request,
        CancellationToken cancellationToken = default);
    Task<BookingDto> UpdateChargesAsync(
        int id,
        UpdateBookingChargesRequest request,
        CancellationToken cancellationToken = default);
    Task<BookingDto> CancelAsync(
        int id,
        CancellationToken cancellationToken = default);
    Task<BookingDto> CheckoutAsync(
        int id,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Exports all archived history to a branded PDF, hard-deletes those bookings,
    /// and keeps only a flush audit log entry.
    /// </summary>
    Task<FlushBookingHistoryResult> FlushHistoryAsync(
        string performedBy,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<BookingHistoryFlushLogDto>> GetHistoryFlushLogsAsync(
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
