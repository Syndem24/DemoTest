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

                // 1. Process 10-minute advance checkout warnings
                var warnedBookings = await bookingService.ProcessCheckoutWarningsAsync(stoppingToken);
                foreach (var booking in warnedBookings)
                {
                    _logger.LogInformation(
                        "Sent 10-minute checkout warning for booking {Reference} (Guest: {GuestName})",
                        booking.Reference,
                        booking.GuestName);

                    await _hubContext.Clients.All.BookingUpdated(ToNotification(booking, "Checkout Warning: 10 mins remaining for stay"));
                }

                // 2. Process automatic checkouts for expired stay durations
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
            booking.CheckIn,
            booking.CreatedAtUtc,
            false,
            message);
    }
}
