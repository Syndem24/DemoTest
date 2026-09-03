using Microsoft.AspNetCore.SignalR;
using TestingDemo.Hubs;

namespace TestingDemo.Services;

public interface IAuditLogNotifier
{
    Task NotifyChangedAsync(CancellationToken cancellationToken = default);
}

public sealed class AuditLogNotifier : IAuditLogNotifier
{
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;

    public AuditLogNotifier(IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _hub = hub;
    }

    public async Task NotifyChangedAsync(CancellationToken cancellationToken = default)
    {
        await _hub.Clients.All.AuditLogChanged();
    }
}
