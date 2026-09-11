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
public sealed partial class BookingService : IBookingService
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
