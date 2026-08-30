using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed record DashboardDayPoint(string Label, decimal Revenue, int Arrivals, int OccupiedRooms);

public sealed record DashboardStatusSlice(string Label, int Count);

public sealed record DashboardAttentionItem(string Title, string Detail, string Href);

public sealed record DashboardSignal(string Title, string Detail, string Level);

public sealed record DashboardSnapshot(
    string RoleName,
    bool IsAdminManager,
    string AsOfPh,
    int RoomsTotal,
    int RoomsAvailable,
    int RoomsOccupied,
    int RoomsCleaning,
    int RoomsUnavailable,
    decimal OccupancyPercent,
    int InHouseStays,
    int ArrivalsToday,
    int DeparturesToday,
    int PendingStays,
    int ConfirmedStays,
    decimal RevenueToday,
    decimal RevenueMonth,
    decimal RefundsMonth,
    decimal PipelineValue,
    decimal AverageStayValue,
    decimal BookedSharePercent,
    decimal Adr,
    decimal RevPar,
    int ActiveOffers,
    IReadOnlyList<DashboardDayPoint> Last7Days,
    IReadOnlyList<DashboardStatusSlice> StatusMix,
    IReadOnlyList<DashboardStatusSlice> ChannelMix,
    IReadOnlyList<DashboardSignal> Signals,
    IReadOnlyList<DashboardAttentionItem> Attention);

public interface IDashboardAnalyticsService
{
    Task<DashboardSnapshot> GetSnapshotAsync(bool isAdminManager, string roleName, CancellationToken cancellationToken = default);
}

public sealed class DashboardAnalyticsService : IDashboardAnalyticsService
{
    private readonly HotelBookingDbContext _db;

    public DashboardAnalyticsService(HotelBookingDbContext db)
    {
        _db = db;
    }

    public async Task<DashboardSnapshot> GetSnapshotAsync(
        bool isAdminManager,
        string roleName,
        CancellationToken cancellationToken = default)
    {
        var nowUtc = DateTime.UtcNow;
        var todayStart = PhilippinesTime.StartOfTodayUtc();
        var tomorrowStart = todayStart.AddDays(1);
        var monthStartManila = new DateTime(PhilippinesTime.NowManila().Year, PhilippinesTime.NowManila().Month, 1);
        var monthStartUtc = PhilippinesTime.ToUtc(monthStartManila);
        var weekStartUtc = todayStart.AddDays(-6);

        var rooms = await _db.Rooms.AsNoTracking()
            .Select(r => r.Status)
            .ToListAsync(cancellationToken);
        var roomsTotal = rooms.Count;
        var roomsAvailable = rooms.Count(s => s == RoomStatus.Available);
        var roomsOccupied = rooms.Count(s => s == RoomStatus.Occupied);
        var roomsCleaning = rooms.Count(s => s == RoomStatus.Cleaning);
        var roomsUnavailable = rooms.Count(s => s == RoomStatus.Unavailable);
        var occupancy = roomsTotal == 0 ? 0 : Math.Round(100m * roomsOccupied / roomsTotal, 1);

        var live = _db.Bookings.AsNoTracking().Where(b => !b.IsArchived);
        var pending = await live.CountAsync(b => b.Status == BookingStatus.Pending, cancellationToken);
        var confirmed = await live.CountAsync(b => b.Status == BookingStatus.Confirmed, cancellationToken);
        var inHouse = await live.CountAsync(
            b => b.Status == BookingStatus.Confirmed
                 && b.CheckInAtUtc < tomorrowStart
                 && b.CheckoutTimeUtc > nowUtc,
            cancellationToken);
        var arrivals = await live.CountAsync(
            b => (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
                 && b.CheckInAtUtc >= todayStart
                 && b.CheckInAtUtc < tomorrowStart,
            cancellationToken);
        var departures = await live.CountAsync(
            b => b.Status == BookingStatus.Confirmed
                 && b.CheckoutTimeUtc >= todayStart
                 && b.CheckoutTimeUtc < tomorrowStart,
            cancellationToken);

        var rejected = await live.CountAsync(b => b.Status == BookingStatus.Rejected, cancellationToken);
        var cancelled = await live.CountAsync(b => b.Status == BookingStatus.Cancelled, cancellationToken);
        var checkedOut = await live.CountAsync(b => b.Status == BookingStatus.CheckedOut, cancellationToken);

        var pipeline = await live
            .Where(b => b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
            .SumAsync(b => (decimal?)b.TotalAmount, cancellationToken) ?? 0;

        var payments = await _db.PaymentRecords.AsNoTracking()
            .Where(p => p.PaidAtUtc >= monthStartUtc || (p.VoidedAtUtc != null && p.VoidedAtUtc >= monthStartUtc))
            .Select(p => new { p.Amount, p.Status, p.PaidAtUtc, p.VoidedAtUtc })
            .ToListAsync(cancellationToken);

        decimal RevenueIn(DateTime from, DateTime to) =>
            payments
                .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount > 0 && p.PaidAtUtc >= from && p.PaidAtUtc < to)
                .Sum(p => p.Amount);

        decimal RefundsIn(DateTime from, DateTime to)
        {
            var postedNeg = payments
                .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount < 0 && p.PaidAtUtc >= from && p.PaidAtUtc < to)
                .Sum(p => p.Amount);
            var voided = payments
                .Where(p => p.Status == PaymentRecordStatus.Voided
                            && (p.VoidedAtUtc ?? p.PaidAtUtc) >= from
                            && (p.VoidedAtUtc ?? p.PaidAtUtc) < to)
                .Sum(p => Math.Abs(p.Amount));
            return Math.Abs(postedNeg) + voided;
        }

        var revenueToday = RevenueIn(todayStart, tomorrowStart);
        var revenueMonth = RevenueIn(monthStartUtc, tomorrowStart);
        var refundsMonth = RefundsIn(monthStartUtc, tomorrowStart);
        var adr = roomsOccupied == 0 ? 0 : Math.Round(revenueToday / roomsOccupied, 2);
        var revPar = roomsTotal == 0 ? 0 : Math.Round(revenueToday / roomsTotal, 2);

        var weekBookings = await live
            .Where(b => b.CheckInAtUtc >= weekStartUtc && b.CheckInAtUtc < tomorrowStart)
            .Select(b => new { b.CheckInAtUtc, b.Status })
            .ToListAsync(cancellationToken);

        var stayWindows = await live
            .Where(b =>
                (b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedOut)
                && b.CheckoutTimeUtc > weekStartUtc
                && b.CheckInAtUtc < tomorrowStart)
            .Select(b => new
            {
                b.CheckInAtUtc,
                b.CheckoutTimeUtc,
                Rooms = b.Items.Sum(i => i.RoomAssignments.Count > 0 ? i.RoomAssignments.Count : i.Quantity)
            })
            .ToListAsync(cancellationToken);

        var last7 = new List<DashboardDayPoint>(7);
        for (var i = 0; i < 7; i++)
        {
            var dayStart = todayStart.AddDays(i - 6);
            var dayEnd = dayStart.AddDays(1);
            var label = PhilippinesTime.ToManila(dayStart).ToString("dd MMM");
            var dayArrivals = weekBookings.Count(b =>
                (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
                && b.CheckInAtUtc >= dayStart
                && b.CheckInAtUtc < dayEnd);
            var occupied = stayWindows
                .Where(s => s.CheckInAtUtc < dayEnd && s.CheckoutTimeUtc > dayStart)
                .Sum(s => s.Rooms);
            last7.Add(new DashboardDayPoint(label, RevenueIn(dayStart, dayEnd), dayArrivals, occupied));
        }

        var openCount = pending + confirmed;
        var averageStay = openCount == 0 ? 0 : Math.Round(pipeline / openCount, 2);
        var bookedShare = openCount == 0 ? 0 : Math.Round(100m * confirmed / openCount, 1);

        var channelRows = await live
            .Where(b => b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
            .GroupBy(b => b.Channel)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);
        var channelMix = channelRows
            .OrderByDescending(r => r.Count)
            .Select(r => new DashboardStatusSlice(ChannelLabel(r.Key), r.Count))
            .ToList();

        var activeOffers = await _db.SpecialOffers.AsNoTracking()
            .CountAsync(
                o => o.IsActive && o.StartsAtUtc <= nowUtc && o.EndsAtUtc >= nowUtc,
                cancellationToken);

        var signals = BuildSignals(
            isAdminManager,
            occupancy,
            roomsAvailable,
            roomsCleaning,
            roomsUnavailable,
            pending,
            arrivals,
            revenueMonth,
            refundsMonth,
            pipeline,
            activeOffers);

        var attention = await live
            .Where(b =>
                (b.Status == BookingStatus.Pending && b.CheckInAtUtc < tomorrowStart.AddHours(12))
                || (b.Status == BookingStatus.Confirmed
                    && b.CheckInAtUtc >= todayStart
                    && b.CheckInAtUtc < tomorrowStart))
            .OrderBy(b => b.CheckInAtUtc)
            .Take(8)
            .Select(b => new
            {
                b.Reference,
                b.GuestName,
                b.Status,
                b.CheckInAtUtc
            })
            .ToListAsync(cancellationToken);

        var attentionItems = attention.Select(row =>
        {
            var when = PhilippinesTime.ToManila(row.CheckInAtUtc).ToString("h:mm tt");
            var title = row.Status == BookingStatus.Pending ? $"Call · {row.GuestName}" : $"Arrival · {row.GuestName}";
            return new DashboardAttentionItem(
                title,
                $"{row.Reference} · {when}",
                "/AdminBookings");
        }).ToList();

        return new DashboardSnapshot(
            roleName,
            isAdminManager,
            PhilippinesTime.FormatStamp(nowUtc),
            roomsTotal,
            roomsAvailable,
            roomsOccupied,
            roomsCleaning,
            roomsUnavailable,
            occupancy,
            inHouse,
            arrivals,
            departures,
            pending,
            confirmed,
            revenueToday,
            revenueMonth,
            refundsMonth,
            pipeline,
            averageStay,
            bookedShare,
            adr,
            revPar,
            activeOffers,
            last7,
            [
                new DashboardStatusSlice("Pending", pending),
                new DashboardStatusSlice("Confirmed", confirmed),
                new DashboardStatusSlice("Checked out", checkedOut),
                new DashboardStatusSlice("Cancelled", cancelled),
                new DashboardStatusSlice("Rejected", rejected)
            ],
            channelMix,
            signals,
            attentionItems);
    }

    private static string ChannelLabel(BookingChannel channel) => channel switch
    {
        BookingChannel.Online => "Online",
        BookingChannel.WalkIn => "Walk-in",
        BookingChannel.FrontDeskExtension => "Front desk",
        BookingChannel.Agoda => "Agoda",
        BookingChannel.Expedia => "Expedia",
        BookingChannel.RedDoorz => "RedDoorz",
        BookingChannel.OtherThirdParty => "Other OTA",
        _ => channel.ToString()
    };

    private static IReadOnlyList<DashboardSignal> BuildSignals(
        bool isAdminManager,
        decimal occupancy,
        int roomsAvailable,
        int roomsCleaning,
        int roomsUnavailable,
        int pending,
        int arrivals,
        decimal revenueMonth,
        decimal refundsMonth,
        decimal pipeline,
        int activeOffers)
    {
        var signals = new List<DashboardSignal>(5);

        if (occupancy >= 85m)
            signals.Add(new DashboardSignal("Near full", "Protect rate and watch same-day walk-ins against remaining rooms.", "alert"));
        else if (occupancy > 0 && occupancy < 40m)
            signals.Add(new DashboardSignal("Soft occupancy", "Inventory is loose — push walk-in and live offers.", "watch"));
        else if (occupancy >= 40m)
            signals.Add(new DashboardSignal("Balanced house", "Occupancy is in a workable band for tonight.", "good"));
        else
            signals.Add(new DashboardSignal("Empty house", "No rooms marked occupied. Confirm room statuses in Rooms.", "watch"));

        if (pending > 0 && arrivals > 0)
            signals.Add(new DashboardSignal("Call pending arrivals", $"{pending} pending stay(s) and {arrivals} arrival(s) today — confirm before check-in.", "alert"));
        else if (pending > 0)
            signals.Add(new DashboardSignal("Pending bookings", $"{pending} stay(s) still need a confirm or reject.", "watch"));

        if (roomsCleaning > 0)
            signals.Add(new DashboardSignal("Housekeeping load", $"{roomsCleaning} room(s) in maintaining. Turn them before the next arrival wave.", "watch"));
        if (roomsUnavailable > 0)
            signals.Add(new DashboardSignal("Offline inventory", $"{roomsUnavailable} room(s) unavailable. That caps sellable rooms.", "watch"));

        if (roomsAvailable > 0 && arrivals == 0 && occupancy < 50m)
            signals.Add(new DashboardSignal("Walk-in window", $"{roomsAvailable} open room(s) and no arrivals on the board. Front desk can sell tonight.", "good"));

        if (activeOffers == 0 && occupancy < 60m)
            signals.Add(new DashboardSignal("No live promo", "No active offer. A limited-time rate can lift soft dates.", "watch"));

        if (isAdminManager && revenueMonth > 0 && refundsMonth >= revenueMonth * 0.15m)
            signals.Add(new DashboardSignal("Refund pressure", "Refunds are at least 15% of posted month revenue. Review payment voids.", "alert"));
        else if (isAdminManager && pipeline > revenueMonth * 2 && pipeline > 0)
            signals.Add(new DashboardSignal("Uncollected pipeline", "Open stay value is more than twice posted month cash. Chase remaining balances.", "watch"));

        return signals.Take(5).ToList();
    }
}
