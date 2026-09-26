using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Options;
using TestingDemo.Services.Chat;

namespace TestingDemo.Services;

public sealed record DashboardDayPoint(string Label, decimal Revenue, int Arrivals, int OccupiedRooms);

public sealed record DashboardStatusSlice(string Label, int Count);

/// <summary>
/// One front-desk attention row. Action "review" = pending stay awaiting a confirm/reject
/// call; "arrival" = confirmed guest landing today, dismissible with a mark-read.
/// </summary>
public sealed record DashboardAttentionItem(
    string Title,
    string Detail,
    string Href,
    int BookingId,
    string Action);

public sealed record DashboardSignal(string Title, string Detail, string Level);

/// <summary>One physical room shown as a chip in the room-availability breakdown.</summary>
public sealed record DashboardRoomCell(string RoomNumber, string Status);

/// <summary>Per-room-type availability row for the dashboard switch list.</summary>
public sealed record DashboardRoomTypeRow(
    int RoomTypeId,
    string Name,
    int RoomCount,
    int AvailableCount,
    int OccupiedCount,
    IReadOnlyList<DashboardRoomCell> Rooms);

/// <summary>One pending guest review row — published but not yet answered by the hotel.</summary>
public sealed record DashboardReviewItem(
    int ReviewId,
    string Title,
    string Detail,
    string Href);

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
    IReadOnlyList<DashboardStatusSlice> StayMix,
    IReadOnlyList<DashboardSignal> Signals,
    IReadOnlyList<DashboardAttentionItem> Attention,
    IReadOnlyList<DashboardRoomTypeRow> RoomTypes,
    IReadOnlyList<DashboardReviewItem> PendingReviews,
    int PendingReviewCount);

/// <summary>One printable line for the bookings/reservations report tables.</summary>
public sealed record DashboardReportBookingRow(
    string Reference,
    string GuestName,
    string Kind,
    string Status,
    DateTime CheckInAtUtc,
    DateTime CheckoutTimeUtc,
    string Rooms,
    decimal TotalAmount,
    decimal PaidTotal);

/// <summary>One printable payment-ledger line.</summary>
public sealed record DashboardReportPaymentRow(
    string ReceiptNumber,
    string BookingReference,
    string EventType,
    string Method,
    decimal Amount,
    string Status,
    DateTime PaidAtUtc,
    string ReceivedBy);

/// <summary>Per-door status line.</summary>
public sealed record DashboardReportRoomRow(
    string RoomNumber,
    string RoomTypeName,
    string Status);

/// <summary>Per-type inventory rollup.</summary>
public sealed record DashboardReportRoomTypeRow(
    string Name,
    int Total,
    int Available,
    int Occupied,
    int Cleaning,
    int Unavailable,
    decimal PricePerNight);

/// <summary>One column of the per-date availability grid: a room type and its door count.</summary>
public sealed record DashboardReportRoomTypeColumn(string Name, int Total);

/// <summary>
/// One Manila date in the availability grid. <see cref="BookedByType"/> is aligned
/// with the report's <c>RoomTypeColumns</c> order. Occupied = rooms held by
/// pending/confirmed stays that night; Available = sellable doors minus holds;
/// Cleaning/Unavailable are current housekeeping flags applied flat across dates.
/// </summary>
public sealed record DashboardReportAvailabilityRow(
    string DateLabel,
    IReadOnlyList<int> BookedByType,
    int Occupied,
    int Available,
    int Cleaning,
    int Unavailable,
    decimal OccupancyPercent);

/// <summary>Full printable operations report — tables first, chart data last.</summary>
public sealed record DashboardReportDto(
    string HotelName,
    DateTime GeneratedAtUtc,
    string GeneratedBy,
    string RangeLabel,
    int BookingCount,
    int ReservationCount,
    int PaymentRecordCount,
    int RoomCount,
    decimal RevenuePostedTotal,
    IReadOnlyList<DashboardReportBookingRow> Bookings,
    IReadOnlyList<DashboardReportBookingRow> Reservations,
    IReadOnlyList<DashboardReportPaymentRow> Payments,
    IReadOnlyList<DashboardReportRoomTypeRow> RoomTypes,
    IReadOnlyList<DashboardReportRoomRow> Rooms,
    IReadOnlyList<DashboardReportRoomTypeColumn> RoomTypeColumns,
    IReadOnlyList<DashboardReportAvailabilityRow> AvailabilityByDate,
    bool AvailabilityTruncated,
    IReadOnlyList<DashboardDayPoint> Trend,
    IReadOnlyList<DashboardStatusSlice> BookingStatusMix,
    IReadOnlyList<DashboardStatusSlice> RoomStatusMix);

public interface IDashboardAnalyticsService
{
    Task<DashboardSnapshot> GetSnapshotAsync(bool isAdminManager, string roleName, CancellationToken cancellationToken = default);
    Task<DashboardReportDto> GetReportAsync(string generatedBy, DateOnly fromDate, DateOnly toDate, CancellationToken cancellationToken = default);
}

public sealed class DashboardAnalyticsService : IDashboardAnalyticsService
{
    private readonly HotelBookingDbContext _db;
    private readonly ChatProviderUsageTracker _chatUsage;
    private readonly ChatbotOptions _chatbot;
    private readonly ISecureConfigStore _vault;

    public DashboardAnalyticsService(
        HotelBookingDbContext db,
        ChatProviderUsageTracker chatUsage,
        IOptions<ChatbotOptions> chatbot,
        ISecureConfigStore vault)
    {
        _db = db;
        _chatUsage = chatUsage;
        _chatbot = chatbot.Value;
        _vault = vault;
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

        var roomFlat = await _db.Rooms.AsNoTracking()
            .Select(r => new { r.RoomTypeId, TypeName = r.RoomType.Name, r.RoomNumber, r.Status })
            .ToListAsync(cancellationToken);
        var roomsTotal = roomFlat.Count;
        var roomsAvailable = roomFlat.Count(s => s.Status == RoomStatus.Available);
        var roomsOccupied = roomFlat.Count(s => s.Status == RoomStatus.Occupied);
        var roomsCleaning = roomFlat.Count(s => s.Status == RoomStatus.Cleaning);
        var roomsUnavailable = roomFlat.Count(s => s.Status == RoomStatus.Unavailable);
        var occupancy = roomsTotal == 0 ? 0 : Math.Round(100m * roomsOccupied / roomsTotal, 1);

        var roomTypeRows = roomFlat
            .GroupBy(r => new { r.RoomTypeId, r.TypeName })
            .OrderBy(g => g.Key.TypeName, StringComparer.OrdinalIgnoreCase)
            .Select(g => new DashboardRoomTypeRow(
                g.Key.RoomTypeId,
                g.Key.TypeName,
                g.Count(),
                g.Count(r => r.Status == RoomStatus.Available),
                g.Count(r => r.Status == RoomStatus.Occupied),
                g.OrderBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase)
                    .Select(r => new DashboardRoomCell(r.RoomNumber, r.Status.ToString()))
                    .ToList()))
            .ToList();

        var pendingReviewRows = await _db.StayReviews.AsNoTracking()
            .Where(r => r.DeletedAtUtc == null && !r.HasHotelReply)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new
            {
                r.Id,
                r.DisplayName,
                r.OverallRating,
                r.Comment,
                r.CreatedAtUtc,
                r.Booking.Reference
            })
            .Take(6)
            .ToListAsync(cancellationToken);
        var pendingReviewCount = await _db.StayReviews.AsNoTracking()
            .CountAsync(r => r.DeletedAtUtc == null && !r.HasHotelReply, cancellationToken);

        var liveRows = await _db.Bookings.AsNoTracking()
            .Where(b => !b.IsArchived)
            .Select(b => new LiveBookingRow(
                b.Id,
                b.Status,
                b.Kind,
                b.CheckInAtUtc,
                b.CheckoutTimeUtc,
                b.TotalAmount,
                b.Channel,
                b.Reference,
                b.GuestName))
            .ToListAsync(cancellationToken);

        var pending = liveRows.Count(b => b.Status == BookingStatus.Pending);
        var confirmed = liveRows.Count(b => b.Status == BookingStatus.Confirmed);
        var inHouse = liveRows.Count(b =>
            b.Status == BookingStatus.Confirmed
            && b.CheckInAtUtc < tomorrowStart
            && b.CheckoutTimeUtc > nowUtc);
        var arrivals = liveRows.Count(b =>
            (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
            && b.CheckInAtUtc >= todayStart
            && b.CheckInAtUtc < tomorrowStart);
        var departures = liveRows.Count(b =>
            b.Status == BookingStatus.Confirmed
            && b.CheckoutTimeUtc >= todayStart
            && b.CheckoutTimeUtc < tomorrowStart);
        var rejected = liveRows.Count(b => b.Status == BookingStatus.Rejected);
        var cancelled = liveRows.Count(b => b.Status == BookingStatus.Cancelled);
        var checkedOut = liveRows.Count(b => b.Status == BookingStatus.CheckedOut);

        var pipeline = liveRows
            .Where(b => b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
            .Sum(b => b.TotalAmount);

        var liveIds = liveRows.Select(b => b.Id).ToList();
        var roomsByBooking = await LoadRoomCountsByBookingAsync(liveIds, cancellationToken);

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

        var weekBookings = liveRows
            .Where(b => b.CheckInAtUtc >= weekStartUtc && b.CheckInAtUtc < tomorrowStart)
            .ToList();

        var stayWindows = liveRows
            .Where(b =>
                (b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedOut)
                && b.CheckoutTimeUtc > weekStartUtc
                && b.CheckInAtUtc < tomorrowStart)
            .Select(b => new StayWindowRow(
                b.CheckInAtUtc,
                b.CheckoutTimeUtc,
                roomsByBooking.GetValueOrDefault(b.Id, 0)))
            .ToList();

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

        var stayMix = liveRows
            .Where(b => b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
            .GroupBy(b => b.Kind)
            .OrderByDescending(g => g.Count())
            .Select(g => new DashboardStatusSlice(
                g.Key == BookingKind.Reservation ? "Reservations" : "Bookings",
                g.Count()))
            .ToList();

        // One campaign can span several room types — count offers, not rows.
        var activeOffers = await _db.SpecialOffers.AsNoTracking()
            .Where(o => o.IsActive && o.StartsAtUtc <= nowUtc && o.EndsAtUtc >= nowUtc)
            .GroupBy(o => new { o.Kind, o.Title, o.StartsAtUtc, o.EndsAtUtc })
            .CountAsync(cancellationToken);

        var geminiConfigured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
        var groqConfigured = await _vault.HasValueAsync(SecureSettingKeys.GroqApiKey, cancellationToken);

        var signals = BuildSignals(
            isAdminManager,
            _chatUsage.GetApiConsumptionSnapshot(),
            _chatUsage.GetForceFallbackInfo(ChatProviderKind.Gemini),
            _chatUsage.GetForceFallbackInfo(ChatProviderKind.Groq),
            geminiConfigured,
            groqConfigured,
            _chatbot,
            roomsCleaning,
            roomsUnavailable,
            pending,
            arrivals,
            revenueMonth,
            refundsMonth,
            pipeline,
            activeOffers);

        // Pending stays always need a decision — list them regardless of how far
        // out check-in is, nearest first; same-day confirmed arrivals follow.
        var attentionItems = liveRows
            .Where(b =>
                b.Status == BookingStatus.Pending
                || (b.Status == BookingStatus.Confirmed
                    && b.CheckInAtUtc >= todayStart
                    && b.CheckInAtUtc < tomorrowStart))
            .OrderBy(b => b.Status == BookingStatus.Pending ? 0 : 1)
            .ThenBy(b => b.CheckInAtUtc)
            .Take(8)
            .Select(row =>
            {
                var whenManila = PhilippinesTime.ToManila(row.CheckInAtUtc);
                var when = row.CheckInAtUtc < tomorrowStart
                    ? whenManila.ToString("h:mm tt")
                    : whenManila.ToString("MMM d · h:mm tt");
                var title = row.Status == BookingStatus.Pending
                    ? $"Call · {row.GuestName}"
                    : $"Arrival · {row.GuestName}";
                return new DashboardAttentionItem(
                    title,
                    $"{row.Reference} · {when}",
                    $"/AdminBookings?booking={row.Id}",
                    row.Id,
                    row.Status == BookingStatus.Pending ? "review" : "arrival");
            })
            .ToList();

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
            stayMix,
            signals,
            attentionItems,
            roomTypeRows,
            pendingReviewRows
                .Select(r => new DashboardReviewItem(
                    r.Id,
                    $"★{r.OverallRating} · {r.DisplayName}",
                    $"{r.Reference} · {Snippet(r.Comment)}",
                    "/AdminReviews?replyState=pending"))
                .ToList(),
            pendingReviewCount);
    }

    /// <summary>Short one-line preview for dashboard widgets.</summary>
    private static string Snippet(string? text, int max = 60)
    {
        var clean = (text ?? string.Empty).Trim();
        if (clean.Length == 0)
        {
            return "No written comment";
        }

        return clean.Length <= max ? clean : clean[..max].TrimEnd() + "…";
    }

    /// <summary>
    /// Printable operations report — raw tables (bookings, reservations, payment
    /// ledger, room status) first, chart aggregates last so the printed document
    /// ends on the graphs page.
    /// </summary>
    public async Task<DashboardReportDto> GetReportAsync(
        string generatedBy,
        DateOnly fromDate,
        DateOnly toDate,
        CancellationToken cancellationToken = default)
    {
        var range = FlushDateRange.FromManilaDates(fromDate, toDate);
        var fromUtc = range.FromUtcInclusive!.Value;
        var toUtc = range.ToUtcExclusive!.Value;
        var rangeLabel = string.Concat(
            fromDate.ToString("dd MMM yyyy"), " – ", toDate.ToString("dd MMM yyyy"), " (Manila)");
        var nowUtc = DateTime.UtcNow;

        var bookingRows = await _db.Bookings.AsNoTracking()
            .Where(b => !b.IsArchived
                && b.CheckInAtUtc < toUtc
                && b.CheckoutTimeUtc > fromUtc)
            .OrderBy(b => b.CheckInAtUtc)
            .Select(b => new
            {
                b.Id,
                b.Reference,
                b.GuestName,
                b.Kind,
                b.Status,
                b.CheckInAtUtc,
                b.CheckoutTimeUtc,
                b.TotalAmount,
                Items = b.Items.Select(i => new { i.RoomTypeName, i.Quantity }).ToList(),
            })
            .ToListAsync(cancellationToken);

        var paidByBooking = await _db.PaymentRecords.AsNoTracking()
            .Where(p => p.Status == PaymentRecordStatus.Posted)
            .GroupBy(p => p.BookingId)
            .Select(g => new { g.Key, Paid = g.Sum(p => p.Amount) })
            .ToDictionaryAsync(x => x.Key, x => x.Paid, cancellationToken);

        var allRows = bookingRows
            .Select(b => new DashboardReportBookingRow(
                b.Reference,
                b.GuestName,
                b.Kind == BookingKind.Reservation ? "Reservation" : "Booking",
                b.Status.ToString(),
                b.CheckInAtUtc,
                b.CheckoutTimeUtc,
                string.Join(" · ", b.Items
                    .GroupBy(i => i.RoomTypeName)
                    .Select(g => $"{g.Sum(i => i.Quantity)}× {g.Key}")),
                b.TotalAmount,
                paidByBooking.GetValueOrDefault(b.Id)))
            .ToList();

        var bookings = allRows.Where(r => r.Kind == "Booking").ToList();
        var reservations = allRows.Where(r => r.Kind == "Reservation").ToList();

        var payments = await _db.PaymentRecords.AsNoTracking()
            .Where(p => p.PaidAtUtc >= fromUtc && p.PaidAtUtc < toUtc)
            .OrderByDescending(p => p.PaidAtUtc)
            .Take(500)
            .Select(p => new DashboardReportPaymentRow(
                p.ReceiptNumber,
                p.Booking.Reference,
                p.EventType.ToString(),
                p.Method.ToString(),
                p.Amount,
                p.Status.ToString(),
                p.PaidAtUtc,
                p.ReceivedBy))
            .ToListAsync(cancellationToken);

        var roomRows = await _db.Rooms.AsNoTracking()
            .Include(r => r.RoomType)
            .OrderBy(r => r.RoomType.Name)
            .ThenBy(r => r.RoomNumber)
            .Select(r => new DashboardReportRoomRow(
                r.RoomNumber,
                r.RoomType.Name,
                r.Status.ToString()))
            .ToListAsync(cancellationToken);

        var roomTypePrices = await _db.RoomTypes.AsNoTracking()
            .Select(rt => new { rt.Name, rt.PricePerNight })
            .ToDictionaryAsync(rt => rt.Name, rt => rt.PricePerNight, cancellationToken);

        var roomTypes = roomRows
            .GroupBy(r => r.RoomTypeName)
            .Select(g => new DashboardReportRoomTypeRow(
                g.Key,
                g.Count(),
                g.Count(r => r.Status == nameof(RoomStatus.Available)),
                g.Count(r => r.Status == nameof(RoomStatus.Occupied)),
                g.Count(r => r.Status == nameof(RoomStatus.Cleaning)),
                g.Count(r => r.Status == nameof(RoomStatus.Unavailable)),
                roomTypePrices.GetValueOrDefault(g.Key)))
            .OrderBy(r => r.Name)
            .ToList();

        var periodPayments = await _db.PaymentRecords.AsNoTracking()
            .Where(p => p.Status == PaymentRecordStatus.Posted
                && p.PaidAtUtc >= fromUtc
                && p.PaidAtUtc < toUtc)
            .Select(p => new { p.Amount, p.PaidAtUtc })
            .ToListAsync(cancellationToken);

        var confirmedIds = bookingRows
            .Where(b => b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedOut)
            .Select(b => b.Id)
            .ToList();
        var roomsByBooking = await LoadRoomCountsByBookingAsync(confirmedIds, cancellationToken);

        // One chart bucket per Manila day up to ~5 weeks, then weekly buckets.
        var spanDays = toDate.DayNumber - fromDate.DayNumber + 1;
        var bucketDays = spanDays <= 40 ? 1 : 7;
        var trend = new List<DashboardDayPoint>((spanDays + bucketDays - 1) / bucketDays);
        for (var offset = 0; offset < spanDays; offset += bucketDays)
        {
            var bucketFrom = fromDate.AddDays(offset);
            var bucketTo = fromDate.AddDays(Math.Min(offset + bucketDays, spanDays));
            var bucketFromUtc = PhilippinesTime.ToUtc(
                DateTime.SpecifyKind(bucketFrom.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified));
            var bucketToUtc = PhilippinesTime.ToUtc(
                DateTime.SpecifyKind(bucketTo.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified));
            var label = bucketDays == 1
                ? bucketFrom.ToString("dd MMM")
                : string.Concat(bucketFrom.ToString("dd MMM"), " – ", bucketTo.AddDays(-1).ToString("dd MMM"));
            var revenue = periodPayments
                .Where(p => p.PaidAtUtc >= bucketFromUtc && p.PaidAtUtc < bucketToUtc && p.Amount > 0)
                .Sum(p => p.Amount);
            var arrivals = bookingRows.Count(b =>
                (b.Status == BookingStatus.Pending || b.Status == BookingStatus.Confirmed)
                && b.CheckInAtUtc >= bucketFromUtc
                && b.CheckInAtUtc < bucketToUtc);
            var occupied = bookingRows
                .Where(b =>
                    (b.Status == BookingStatus.Confirmed || b.Status == BookingStatus.CheckedOut)
                    && b.CheckInAtUtc < bucketToUtc
                    && b.CheckoutTimeUtc > bucketFromUtc)
                .Sum(b => roomsByBooking.GetValueOrDefault(b.Id, 0));
            trend.Add(new DashboardDayPoint(label, revenue, arrivals, occupied));
        }

        var statusMix = new[]
        {
            new DashboardStatusSlice("Pending", bookingRows.Count(b => b.Status == BookingStatus.Pending)),
            new DashboardStatusSlice("Confirmed", bookingRows.Count(b => b.Status == BookingStatus.Confirmed)),
            new DashboardStatusSlice("Checked out", bookingRows.Count(b => b.Status == BookingStatus.CheckedOut)),
            new DashboardStatusSlice("Cancelled", bookingRows.Count(b => b.Status == BookingStatus.Cancelled)),
            new DashboardStatusSlice("Rejected", bookingRows.Count(b => b.Status == BookingStatus.Rejected)),
        };

        var roomStatusMix = new[]
        {
            new DashboardStatusSlice("Available", roomRows.Count(r => r.Status == nameof(RoomStatus.Available))),
            new DashboardStatusSlice("Occupied", roomRows.Count(r => r.Status == nameof(RoomStatus.Occupied))),
            new DashboardStatusSlice("Cleaning", roomRows.Count(r => r.Status == nameof(RoomStatus.Cleaning))),
            new DashboardStatusSlice("Unavailable", roomRows.Count(r => r.Status == nameof(RoomStatus.Unavailable))),
        };

        var revenuePostedTotal = periodPayments.Where(p => p.Amount > 0).Sum(p => p.Amount);

        /* ---- per-date room availability / status grid -------------------- */
        /* Mirrors the live inventory rule: Pending + Confirmed stays deduct
           rooms; Cleaning/Unavailable doors subtract from sellable capacity. */
        var roomTypeColumns = roomRows
            .GroupBy(r => r.RoomTypeName)
            .Select(g => new DashboardReportRoomTypeColumn(g.Key, g.Count()))
            .OrderBy(c => c.Name)
            .ToList();

        var cleaningDoors = roomRows.Count(r => r.Status == nameof(RoomStatus.Cleaning));
        var unavailableDoors = roomRows.Count(r => r.Status == nameof(RoomStatus.Unavailable));

        var overlappingLines = await _db.BookingItems.AsNoTracking()
            .Where(line =>
                line.RoomTypeId != null
                && !line.Booking.IsArchived
                && (line.Booking.Status == BookingStatus.Pending
                    || line.Booking.Status == BookingStatus.Confirmed)
                && line.Booking.CheckInAtUtc < toUtc
                && line.Booking.CheckoutTimeUtc > fromUtc)
            .Select(line => new
            {
                TypeName = line.RoomType!.Name,
                line.Quantity,
                line.Booking.CheckInAtUtc,
                line.Booking.CheckoutTimeUtc
            })
            .ToListAsync(cancellationToken);

        var totalCapacity = roomTypeColumns.Sum(c => c.Total);
        var totalMaintenance = cleaningDoors + unavailableDoors;
        const int MaxAvailabilityDays = 93;
        var availabilityDays = Math.Min(spanDays, MaxAvailabilityDays);
        var availabilityByDate = new List<DashboardReportAvailabilityRow>(availabilityDays);

        for (var d = 0; d < availabilityDays; d++)
        {
            var manilaDate = fromDate.AddDays(d);
            var dayStartUtc = PhilippinesTime.ToUtc(
                DateTime.SpecifyKind(manilaDate.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified));
            var dayEndUtc = dayStartUtc.AddDays(1);

            var bookedByType = new int[roomTypeColumns.Count];
            for (var t = 0; t < roomTypeColumns.Count; t++)
            {
                bookedByType[t] = overlappingLines
                    .Where(l => l.TypeName == roomTypeColumns[t].Name
                        && l.CheckInAtUtc < dayEndUtc
                        && l.CheckoutTimeUtc > dayStartUtc)
                    .Sum(l => l.Quantity);
            }

            var occupied = bookedByType.Sum();
            var sellable = totalCapacity - totalMaintenance;
            var available = Math.Max(0, sellable - occupied);
            var occupancyPct = sellable <= 0
                ? 0
                : Math.Round(100m * occupied / sellable, 1);

            availabilityByDate.Add(new DashboardReportAvailabilityRow(
                manilaDate.ToString("ddd dd MMM"),
                bookedByType,
                occupied,
                available,
                cleaningDoors,
                unavailableDoors,
                occupancyPct));
        }

        return new DashboardReportDto(
            "Mori International Hotel",
            nowUtc,
            generatedBy,
            rangeLabel,
            bookings.Count,
            reservations.Count,
            payments.Count,
            roomRows.Count,
            revenuePostedTotal,
            bookings,
            reservations,
            payments,
            roomTypes,
            roomRows,
            roomTypeColumns,
            availabilityByDate,
            spanDays > MaxAvailabilityDays,
            trend,
            statusMix,
            roomStatusMix);
    }

    private async Task<Dictionary<int, int>> LoadRoomCountsByBookingAsync(
        List<int> bookingIds,
        CancellationToken cancellationToken)
    {
        if (bookingIds.Count == 0)
        {
            return new Dictionary<int, int>();
        }

        var itemRows = await _db.BookingItems.AsNoTracking()
            .Where(i => bookingIds.Contains(i.BookingId))
            .Select(i => new { i.BookingId, i.Quantity, Assigned = i.RoomAssignments.Count })
            .ToListAsync(cancellationToken);

        return itemRows
            .GroupBy(i => i.BookingId)
            .ToDictionary(
                g => g.Key,
                g => g.Sum(i => i.Assigned > 0 ? i.Assigned : i.Quantity));
    }

    private static IReadOnlyList<DashboardSignal> BuildSignals(
        bool isAdminManager,
        ChatApiConsumptionSnapshot chatApi,
        ProviderFallbackInfo? geminiFallback,
        ProviderFallbackInfo? groqFallback,
        bool geminiConfigured,
        bool groqConfigured,
        ChatbotOptions chatbot,
        int roomsCleaning,
        int roomsUnavailable,
        int pending,
        int arrivals,
        decimal revenueMonth,
        decimal refundsMonth,
        decimal pipeline,
        int activeOffers)
    {
        var signals = new List<DashboardSignal>(8);

        // Primary panel focus: Chatbot AI API integration + consumption.
        signals.AddRange(BuildChatbotApiSignals(
            chatApi,
            geminiFallback,
            groqFallback,
            geminiConfigured,
            groqConfigured,
            chatbot));

        if (pending > 0 && arrivals > 0)
            signals.Add(new DashboardSignal("Call pending arrivals", $"{pending} pending stay(s) and {arrivals} arrival(s) today — confirm before check-in.", "alert"));
        else if (pending > 0)
            signals.Add(new DashboardSignal("Pending bookings", $"{pending} stay(s) still need a confirm or reject.", "watch"));

        if (roomsCleaning > 0)
            signals.Add(new DashboardSignal("Housekeeping load", $"{roomsCleaning} room(s) in maintaining. Turn them before the next arrival wave.", "watch"));
        if (roomsUnavailable > 0)
            signals.Add(new DashboardSignal("Offline inventory", $"{roomsUnavailable} room(s) unavailable. That caps sellable rooms.", "watch"));

        if (activeOffers == 0)
            signals.Add(new DashboardSignal("No live promo", "No active offer. A limited-time rate can lift soft dates.", "watch"));

        if (isAdminManager && revenueMonth > 0 && refundsMonth >= revenueMonth * 0.15m)
            signals.Add(new DashboardSignal("Refund pressure", "Refunds are at least 15% of posted month revenue. Review payment voids.", "alert"));
        else if (isAdminManager && pipeline > revenueMonth * 2 && pipeline > 0)
            signals.Add(new DashboardSignal("Uncollected pipeline", "Open stay value is more than twice posted month cash. Chase remaining balances.", "watch"));

        return signals.Take(6).ToList();
    }

    private static IReadOnlyList<DashboardSignal> BuildChatbotApiSignals(
        ChatApiConsumptionSnapshot chatApi,
        ProviderFallbackInfo? geminiFallback,
        ProviderFallbackInfo? groqFallback,
        bool geminiConfigured,
        bool groqConfigured,
        ChatbotOptions chatbot)
    {
        var list = new List<DashboardSignal>(4);
        var softBudget = Math.Max(0, chatbot.SoftMonthlyApiCallBudget);
        var monthPct = softBudget <= 0
            ? 0m
            : Math.Round(100m * chatApi.CallsMonth / softBudget, 0);

        if (!chatbot.Enabled)
        {
            list.Add(new DashboardSignal(
                "Chatbot AI off",
                "Guest Mori Assistant is disabled. API integration is idle — turn Chatbot:Enabled on to resume.",
                "watch"));
            return list;
        }

        // Connection status — proves whether vault keys are actually stored.
        if (geminiConfigured && groqConfigured)
        {
            list.Add(new DashboardSignal(
                "Gemini + Groq connected",
                "Both API keys are in the vault. Complex guest questions try Gemini first, then Groq.",
                "good"));
        }
        else if (geminiConfigured)
        {
            list.Add(new DashboardSignal(
                "Gemini connected · Groq missing",
                "Gemini key is stored. Add a Groq key under Admin → Integrations so Groq can answer when Gemini misses.",
                "watch"));
        }
        else if (groqConfigured)
        {
            list.Add(new DashboardSignal(
                "Groq connected · Gemini missing",
                "Groq key is stored. Complex questions will use Groq when Gemini is unavailable.",
                "good"));
        }
        else
        {
            list.Add(new DashboardSignal(
                "No LLM keys",
                "Neither Gemini nor Groq is connected. Guest chat uses FAQ rules only — add keys under Admin → Integrations.",
                "alert"));
        }

        if (geminiFallback is not null)
        {
            var untilPh = PhilippinesTime.ToManila(geminiFallback.UntilUtc).ToString("h:mm tt");
            list.Add(new DashboardSignal(
                "Gemini API paused",
                $"Force-fallback after {geminiFallback.Reason}. Cooldown until {untilPh} (PH). Groq may still answer.",
                "alert"));
        }

        if (groqFallback is not null)
        {
            var untilPh = PhilippinesTime.ToManila(groqFallback.UntilUtc).ToString("h:mm tt");
            list.Add(new DashboardSignal(
                "Groq API paused",
                $"Force-fallback after {groqFallback.Reason}. Cooldown until {untilPh} (PH).",
                "alert"));
        }

        if (!chatbot.UseGeminiFallback)
        {
            list.Add(new DashboardSignal(
                "Rules-only chatbot",
                "FAQ rules answer guests. LLM fallback is off — no Gemini/Groq consumption while UseGeminiFallback is false.",
                "watch"));
        }
        else if (geminiConfigured || groqConfigured)
        {
            var level = chatApi.CallsToday == 0
                ? "good"
                : chatApi.CallsToday >= Math.Max(20, chatbot.MaxLlmPerIpPerDay)
                    ? "watch"
                    : "good";
            var last = string.IsNullOrWhiteSpace(chatApi.LastProvider)
                ? "none yet"
                : chatApi.LastProvider;
            list.Add(new DashboardSignal(
                "API calls today",
                $"{chatApi.GeminiCallsToday} Gemini · {chatApi.GroqCallsToday} Groq · {chatApi.UniqueGuestIpsToday} guest IP(s). Last: {last}. Soft cap {chatbot.MaxLlmPerIpPerDay}/IP/day.",
                level));
        }

        if (softBudget > 0 && (geminiConfigured || groqConfigured || chatApi.CallsMonth > 0))
        {
            var monthLevel = monthPct >= 90m ? "alert" : monthPct >= 70m ? "watch" : "good";
            list.Add(new DashboardSignal(
                "API month budget",
                $"{chatApi.GeminiCallsMonth} Gemini · {chatApi.GroqCallsMonth} Groq ({chatApi.CallsMonth}/{softBudget} soft total, {monthPct}%). Not a hard cut-off.",
                monthLevel));
        }

        return list;
    }

    private sealed record LiveBookingRow(
        int Id,
        BookingStatus Status,
        BookingKind Kind,
        DateTime CheckInAtUtc,
        DateTime CheckoutTimeUtc,
        decimal TotalAmount,
        BookingChannel Channel,
        string Reference,
        string GuestName);

    private sealed record StayWindowRow(
        DateTime CheckInAtUtc,
        DateTime CheckoutTimeUtc,
        int Rooms);
}
