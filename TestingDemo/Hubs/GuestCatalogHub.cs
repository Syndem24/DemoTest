using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace TestingDemo.Hubs;

public interface IGuestCatalogClient
{
    Task GuestCatalogChanged(string reason);
}

/// <summary>Anonymous guest page listeners (accommodations catalog + offers).</summary>
[AllowAnonymous]
public sealed class GuestCatalogHub : Hub<IGuestCatalogClient>
{
}
