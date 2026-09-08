using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Warns admins when a live special offer is about to end (within 5 minutes).
/// </summary>
public sealed class OfferExpiryWarningBackgroundService : BackgroundService
{
    private static readonly TimeSpan LeadTime = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan PruneAfter = TimeSpan.FromMinutes(15);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hubContext;
    private readonly ILogger<OfferExpiryWarningBackgroundService> _logger;

    // One-process guard against spamming the same campaign every tick.
    private readonly Dictionary<string, DateTime> _sent = new(StringComparer.Ordinal);

    public OfferExpiryWarningBackgroundService(
        IServiceScopeFactory scopeFactory,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hubContext,
        ILogger<OfferExpiryWarningBackgroundService> logger)
    {
        _scopeFactory = scopeFactory;
        _hubContext = hubContext;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Offer expiry warning service started.");

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await timer.WaitForNextTickAsync(stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }

                try
                {
                    await ProcessAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.LogError(ex, "Error while processing offer expiry warnings.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown — PeriodicTimer cancels WaitForNextTickAsync.
        }
    }

    private async Task ProcessAsync(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var windowEnd = now.Add(LeadTime);
        PruneSent(now);

        using var scope = _scopeFactory.CreateScope();
        var offers = scope.ServiceProvider.GetRequiredService<ISpecialOfferService>();
        await offers.ExpireEndedOffersAsync(cancellationToken);

        var db = scope.ServiceProvider.GetRequiredService<HotelBookingDbContext>();

        var rows = await db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .Where(o =>
                o.IsActive
                && !o.OpenEnded
                && o.EndsAtUtc.Year < 9999
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore
                    || o.Kind == SpecialOfferKind.GoogleLoyalty)
                && o.EndsAtUtc > now
                && o.EndsAtUtc <= windowEnd)
            .OrderBy(o => o.EndsAtUtc)
            .ToListAsync(cancellationToken);

        var campaigns = rows
            .GroupBy(o => $"{o.Kind}|{o.Title}|{DateTime.SpecifyKind(o.EndsAtUtc, DateTimeKind.Utc):O}");

        foreach (var campaign in campaigns)
        {
            var first = campaign.First();
            var endUtc = DateTime.SpecifyKind(first.EndsAtUtc, DateTimeKind.Utc);
            if (_sent.ContainsKey(campaign.Key))
                continue;

            var mins = Math.Max(1, (int)Math.Ceiling((endUtc - now).TotalMinutes));
            var dto = new SpecialOfferEndingSoonNotificationDto(
                first.Title,
                first.Kind,
                endUtc,
                mins,
                campaign
                    .Select(x => x.RoomType?.Name ?? string.Empty)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(x => x)
                    .ToList());

            await _hubContext.Clients.All.OfferEndingSoon(dto);
            _sent[campaign.Key] = endUtc;

            _logger.LogInformation(
                "Offer ending warning sent for {Title} ({Kind}) ending at {EndsAtUtc}.",
                dto.Title,
                dto.Kind,
                dto.EndsAtUtc);
        }
    }

    private void PruneSent(DateTime nowUtc)
    {
        if (_sent.Count == 0) return;
        var cutoff = nowUtc.Subtract(PruneAfter);
        var keys = _sent
            .Where(kvp => kvp.Value < cutoff)
            .Select(kvp => kvp.Key)
            .ToList();
        foreach (var key in keys)
            _sent.Remove(key);
    }
}
