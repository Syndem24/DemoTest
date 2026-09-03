using Microsoft.AspNetCore.SignalR;
using TestingDemo.Hubs;

namespace TestingDemo.Services;

public interface IGuestCatalogNotifier
{
    Task NotifyChangedAsync(string reason = "updated", CancellationToken cancellationToken = default);
}

public sealed class GuestCatalogNotifier : IGuestCatalogNotifier
{
    private readonly IHubContext<GuestCatalogHub, IGuestCatalogClient> _hub;

    public GuestCatalogNotifier(IHubContext<GuestCatalogHub, IGuestCatalogClient> hub)
    {
        _hub = hub;
    }

    public async Task NotifyChangedAsync(
        string reason = "updated",
        CancellationToken cancellationToken = default)
    {
        await _hub.Clients.All.GuestCatalogChanged(reason);
    }
}
