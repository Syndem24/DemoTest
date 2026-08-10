using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;
using TestingDemo.Hubs;

namespace TestingDemo.Services;

public sealed class AutomaticCheckoutBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hubContext;
    private readonly ILogger<AutomaticCheckoutBackgroundService> _logger;

    public AutomaticCheckoutBackgroundService(
        IServiceScopeFactory scopeFactory,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hubContext,
        ILogger<AutomaticCheckoutBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Automatic Checkout & 10-Minute Warning Background Service started.");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (!stoppingToken.IsCancellationRequested && await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var bookingService = scope.ServiceProvider.GetRequiredService<IBookingService>();

                // 0. Pending call-guest warnings (check-in − 20m)
                var pendingCalls = await bookingService.ProcessPendingCallWarningsAsync(stoppingToken);
                foreach (var booking in pendingCalls)
                {
                    _logger.LogInformation(
                        "Sent pending call warning for booking {Reference} (Guest: {GuestName})",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(
                        ToNotification(booking, "Call guest: verify pending booking (20 mins)"));
                }

                // 1. Process 20-minute advance arrival warnings (Confirmed)
                var arrivingBookings = await bookingService.ProcessArrivalWarningsAsync(stoppingToken);
                foreach (var booking in arrivingBookings)
                {
                    _logger.LogInformation(
                        "Sent 20-minute arrival warning for booking {Reference} (Guest: {GuestName})",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(
                        ToNotification(booking, "Arrival in 20 mins: guest checking in soon"));
                }

                // 2. Process 20-minute checkout call warnings (Confirmed, in-house)
                var warnedBookings = await bookingService.ProcessCheckoutWarningsAsync(stoppingToken);
                foreach (var booking in warnedBookings)
                {
                    _logger.LogInformation(
                        "Sent 20-minute checkout call warning for booking {Reference} (Guest: {GuestName})",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(
                        ToNotification(booking, "Call guest: checkout in 20 mins — ask about late checkout"));
                }

                // 3. Auto-cancel unverified Pending after 4-hour grace past check-in
                var autoCancelled = await bookingService.AutoCancelExpiredPendingAsync(stoppingToken);
                foreach (var booking in autoCancelled)
                {
                    _logger.LogInformation(
                        "Auto-cancelled pending booking {Reference} (Guest: {GuestName}) after 4-hour unverified grace.",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(
                        ToNotification(booking, "Pending booking auto-cancelled (unverified after 4-hour grace)"));
                    await _hubContext.Clients.All.BookingArchived(booking.Id);
                }

                // 4. Process automatic checkouts for expired stay durations
                var autoCheckedOutBookings = await bookingService.AutoCheckoutExpiredBookingsAsync(stoppingToken);
                foreach (var booking in autoCheckedOutBookings)
                {
                    _logger.LogInformation(
                        "Auto-checked out booking {Reference} (Guest: {GuestName}) as stay duration ended.",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(ToNotification(booking, "Auto-Checkout Completed: Client duration done"));
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error processing automatic checkouts / warnings in background service.");
            }
        }
    }

    private static BookingNotificationDto ToNotification(BookingDto booking, string? message)
    {
        return new BookingNotificationDto(
            booking.Id,
            booking.Reference,
            booking.GuestName,
            booking.Kind,
            booking.Status,
            booking.CheckInAtUtc,
            booking.CreatedAtUtc,
            false,
            message);
    }
}
