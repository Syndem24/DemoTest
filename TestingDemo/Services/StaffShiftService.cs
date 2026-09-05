using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IStaffShiftService
{
    Task<StaffShiftPageDto> GetPageAsync(
        string staffUserId,
        string staffDisplayName,
        bool includeAllStaffHistory,
        int recentPage = 1,
        int recentPageSize = 10,
        CancellationToken cancellationToken = default);

    /// <summary>Open shift for this staff member, if any (logout / toolbar checks).</summary>
    Task<StaffShiftDto?> GetOpenShiftAsync(
        string staffUserId,
        CancellationToken cancellationToken = default);

    /// <summary>True when any staff member currently has an open desk shift.</summary>
    Task<bool> AnyOpenShiftAsync(CancellationToken cancellationToken = default);

    Task<StaffShiftDto> StartAsync(
        string staffUserId,
        string staffDisplayName,
        StartStaffShiftRequest request,
        CancellationToken cancellationToken = default);

    Task<StaffShiftDto> UpdateBriefingAsync(
        int id,
        string staffUserId,
        bool isAdminManager,
        UpdateStaffShiftBriefingRequest request,
        CancellationToken cancellationToken = default);

    Task<StaffShiftDto> EndAsync(
        int id,
        string staffUserId,
        bool isAdminManager,
        EndStaffShiftRequest request,
        CancellationToken cancellationToken = default);
}

public sealed class StaffShiftService : IStaffShiftService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;

    public StaffShiftService(HotelBookingDbContext db, ISystemAuditRecorder audit)
    {
        _db = db;
        _audit = audit;
    }

    public async Task<StaffShiftPageDto> GetPageAsync(
        string staffUserId,
        string staffDisplayName,
        bool includeAllStaffHistory,
        int recentPage = 1,
        int recentPageSize = 10,
        CancellationToken cancellationToken = default)
    {
        recentPage = Math.Max(1, recentPage);
        recentPageSize = NormalizePageSize(recentPageSize);

        var current = await _db.StaffShifts
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.StaffUserId == staffUserId && s.EndedAtUtc == null,
                cancellationToken);

        StaffShiftDto? currentDto = null;
        if (current is not null)
        {
            currentDto = await MapAsync(current, cancellationToken);
        }

        var historyQuery = _db.StaffShifts.AsNoTracking().AsQueryable();
        if (!includeAllStaffHistory)
        {
            historyQuery = historyQuery.Where(s => s.StaffUserId == staffUserId);
        }

        var recentTotal = await historyQuery.CountAsync(cancellationToken);
        var recent = await historyQuery
            .OrderByDescending(s => s.StartedAtUtc)
            .Skip((recentPage - 1) * recentPageSize)
            .Take(recentPageSize)
            .ToListAsync(cancellationToken);

        var recentDtos = new List<StaffShiftDto>(recent.Count);
        foreach (var row in recent)
        {
            recentDtos.Add(await MapAsync(row, cancellationToken));
        }

        // Desk continuity: next shift reads the last closed handover from anyone on the desk.
        var lastClosed = await _db.StaffShifts
            .AsNoTracking()
            .Where(s => s.EndedAtUtc != null)
            .OrderByDescending(s => s.EndedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        StaffShiftDto? lastHandover = null;
        if (lastClosed is not null
            && (current is null || lastClosed.Id != current.Id))
        {
            lastHandover = await MapAsync(lastClosed, cancellationToken);
        }

        var liveEnd = DateTime.UtcNow;
        var liveStart = current?.StartedAtUtc ?? PhilippinesTime.StartOfTodayUtc();
        var liveOps = await BuildOpsAsync(liveStart, liveEnd, cancellationToken);

        return new StaffShiftPageDto(
            currentDto,
            lastHandover,
            recentDtos,
            recentTotal,
            recentPage,
            recentPageSize,
            liveOps);
    }

    public async Task<StaffShiftDto?> GetOpenShiftAsync(
        string staffUserId,
        CancellationToken cancellationToken = default)
    {
        var current = await _db.StaffShifts
            .AsNoTracking()
            .FirstOrDefaultAsync(
                s => s.StaffUserId == staffUserId && s.EndedAtUtc == null,
                cancellationToken);
        return current is null ? null : await MapAsync(current, cancellationToken);
    }

    public Task<bool> AnyOpenShiftAsync(CancellationToken cancellationToken = default) =>
        _db.StaffShifts.AsNoTracking().AnyAsync(s => s.EndedAtUtc == null, cancellationToken);

    private static int NormalizePageSize(int pageSize) =>
        pageSize switch
        {
            5 or 10 or 25 or 50 => pageSize,
            _ => 10
        };

    public async Task<StaffShiftDto> StartAsync(
        string staffUserId,
        string staffDisplayName,
        StartStaffShiftRequest request,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
            var open = await _db.StaffShifts
                .FirstOrDefaultAsync(s => s.StaffUserId == staffUserId && s.EndedAtUtc == null, ct);
            if (open is not null)
            {
                throw new InvalidOperationException("You already have an open shift. End it before starting another.");
            }

            var now = DateTime.UtcNow;
            var shift = new StaffShift
            {
                StaffUserId = staffUserId,
                StaffDisplayName = string.IsNullOrWhiteSpace(staffDisplayName)
                    ? staffUserId
                    : staffDisplayName.Trim(),
                StartedAtUtc = now,
                OpeningNote = TrimOrNull(request.OpeningNote, 2000),
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            _db.StaffShifts.Add(shift);
            await _db.SaveChangesAsync(ct);

            await _audit.RecordCommittedAsync(
                SystemAuditIntent.AdministrativeAction,
                SystemAuditDomain.Shift,
                "Shift.Started",
                "StaffShift",
                shift.Id.ToString(),
                shift.StaffDisplayName,
                summary: $"Shift started{(shift.OpeningNote is null ? "" : ": " + shift.OpeningNote)}",
                actorUserId: staffUserId,
                actorDisplayName: shift.StaffDisplayName,
                cancellationToken: ct);

            return await MapAsync(shift, ct);
        }, cancellationToken);
    }

    public async Task<StaffShiftDto> UpdateBriefingAsync(
        int id,
        string staffUserId,
        bool isAdminManager,
        UpdateStaffShiftBriefingRequest request,
        CancellationToken cancellationToken = default)
    {
        var shift = await _db.StaffShifts.FirstOrDefaultAsync(s => s.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Shift was not found.");

        if (!isAdminManager && !string.Equals(shift.StaffUserId, staffUserId, StringComparison.Ordinal))
        {
            throw new UnauthorizedAccessException("You can only edit your own shift.");
        }

        ApplyBriefing(shift, request);
        shift.UpdatedAtUtc = DateTime.UtcNow;

        if (shift.EndedAtUtc is null)
        {
            var summary = await BuildSummaryPayloadAsync(shift.StartedAtUtc, DateTime.UtcNow, cancellationToken);
            shift.ClosingSummaryJson = JsonSerializer.Serialize(summary, JsonOptions);
        }

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Shift,
            "Shift.BriefingSaved",
            "StaffShift",
            shift.Id.ToString(),
            shift.StaffDisplayName,
            summary: "Shift briefing notes updated.",
            actorUserId: staffUserId,
            actorDisplayName: shift.StaffDisplayName);
        await _db.SaveChangesAsync(cancellationToken);
        return await MapAsync(shift, cancellationToken);
    }

    public async Task<StaffShiftDto> EndAsync(
        int id,
        string staffUserId,
        bool isAdminManager,
        EndStaffShiftRequest request,
        CancellationToken cancellationToken = default)
    {
        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
            var shift = await _db.StaffShifts.FirstOrDefaultAsync(s => s.Id == id, ct)
                ?? throw new KeyNotFoundException("Shift was not found.");

            if (!isAdminManager && !string.Equals(shift.StaffUserId, staffUserId, StringComparison.Ordinal))
            {
                throw new UnauthorizedAccessException("You can only end your own shift.");
            }

            if (shift.EndedAtUtc is not null)
            {
                throw new InvalidOperationException("This shift is already ended.");
            }

            var now = DateTime.UtcNow;
            ApplyBriefing(shift, request);
            shift.ClosingNote = TrimOrNull(request.ClosingNote, 2000) ?? shift.ClosingNote;
            shift.EndedAtUtc = now;
            shift.UpdatedAtUtc = now;

            var summary = await BuildSummaryPayloadAsync(shift.StartedAtUtc, now, ct);
            shift.ClosingSummaryJson = JsonSerializer.Serialize(summary, JsonOptions);

            _audit.Record(
                SystemAuditIntent.AdministrativeAction,
                SystemAuditDomain.Shift,
                "Shift.Ended",
                "StaffShift",
                shift.Id.ToString(),
                shift.StaffDisplayName,
                summary: $"Shift ended · collected ₱{summary.Gain.TotalCollected:N2} · {summary.Ops.BookingsConfirmed} confirmed",
                actorUserId: staffUserId,
                actorDisplayName: shift.StaffDisplayName);
            await _db.SaveChangesAsync(ct);
            return await MapAsync(shift, ct);
        }, cancellationToken);
    }

    private static void ApplyBriefing(StaffShift shift, UpdateStaffShiftBriefingRequest request)
    {
        if (request.OpeningNote is not null)
            shift.OpeningNote = TrimOrNull(request.OpeningNote, 2000);
        if (request.ClosingNote is not null)
            shift.ClosingNote = TrimOrNull(request.ClosingNote, 2000);
        if (request.RoomsBriefing is not null)
            shift.RoomsBriefing = TrimOrNull(request.RoomsBriefing, 4000);
        if (request.GuestsBriefing is not null)
            shift.GuestsBriefing = TrimOrNull(request.GuestsBriefing, 4000);
        if (request.OffersBriefing is not null)
            shift.OffersBriefing = TrimOrNull(request.OffersBriefing, 4000);
        if (request.GainNotes is not null)
            shift.GainNotes = TrimOrNull(request.GainNotes, 2000);
    }

    private async Task<StaffShiftDto> MapAsync(StaffShift shift, CancellationToken cancellationToken)
    {
        var end = shift.EndedAtUtc ?? DateTime.UtcNow;
        StaffShiftGainDto gain;
        StaffShiftOpsDto ops;

        if (!string.IsNullOrWhiteSpace(shift.ClosingSummaryJson) && shift.EndedAtUtc is not null)
        {
            try
            {
                var snap = JsonSerializer.Deserialize<ShiftSummaryPayload>(shift.ClosingSummaryJson, JsonOptions);
                if (snap is not null)
                {
                    return ToDto(shift, snap.Gain, snap.Ops);
                }
            }
            catch
            {
                // Fall through to live compute.
            }
        }

        gain = await BuildGainAsync(shift.StartedAtUtc, end, cancellationToken);
        ops = await BuildOpsAsync(shift.StartedAtUtc, end, cancellationToken);
        return ToDto(shift, gain, ops);
    }

    private static StaffShiftDto ToDto(StaffShift shift, StaffShiftGainDto gain, StaffShiftOpsDto ops) =>
        new(
            shift.Id,
            shift.StaffUserId,
            shift.StaffDisplayName,
            shift.StartedAtUtc,
            shift.EndedAtUtc,
            shift.EndedAtUtc is null,
            shift.OpeningNote,
            shift.ClosingNote,
            shift.RoomsBriefing,
            shift.GuestsBriefing,
            shift.OffersBriefing,
            shift.GainNotes,
            gain,
            ops);

    private async Task<ShiftSummaryPayload> BuildSummaryPayloadAsync(
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken)
    {
        var gain = await BuildGainAsync(fromUtc, toUtc, cancellationToken);
        var ops = await BuildOpsAsync(fromUtc, toUtc, cancellationToken);
        return new ShiftSummaryPayload(gain, ops);
    }

    private async Task<StaffShiftGainDto> BuildGainAsync(
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken)
    {
        var rows = await _db.PaymentRecords
            .AsNoTracking()
            .Where(p => p.PaidAtUtc >= fromUtc && p.PaidAtUtc <= toUtc)
            .Select(p => new { p.Method, p.Amount, p.Status, p.EventType })
            .ToListAsync(cancellationToken);

        decimal cash = 0, ewallet = 0, bank = 0, other = 0, collected = 0, refunded = 0;
        var count = 0;
        foreach (var row in rows)
        {
            if (row.Status != PaymentRecordStatus.Posted) continue;
            count++;
            var amount = row.Amount;
            if (row.EventType == PaymentEventType.Refund || amount < 0)
            {
                refunded += Math.Abs(amount);
                continue;
            }

            collected += amount;
            switch (row.Method)
            {
                case PaymentMethod.Cash:
                    cash += amount;
                    break;
                case PaymentMethod.EWallet:
                case PaymentMethod.Maya:
                    ewallet += amount;
                    break;
                case PaymentMethod.BankTransfer:
                    bank += amount;
                    break;
                default:
                    other += amount;
                    break;
            }
        }

        return new StaffShiftGainDto(
            decimal.Round(cash, 2),
            decimal.Round(ewallet, 2),
            decimal.Round(bank, 2),
            decimal.Round(other, 2),
            decimal.Round(collected, 2),
            decimal.Round(refunded, 2),
            count);
    }

    private async Task<StaffShiftOpsDto> BuildOpsAsync(
        DateTime fromUtc,
        DateTime toUtc,
        CancellationToken cancellationToken)
    {
        var created = await _db.Bookings.AsNoTracking()
            .CountAsync(b => b.CreatedAtUtc >= fromUtc && b.CreatedAtUtc <= toUtc, cancellationToken);

        var confirmed = await _db.SystemAuditLogs.AsNoTracking()
            .CountAsync(a =>
                a.Domain == SystemAuditDomain.Booking
                && a.Action == "Booking.Confirmed"
                && a.AtUtc >= fromUtc && a.AtUtc <= toUtc, cancellationToken);

        var checkedOut = await _db.Bookings.AsNoTracking()
            .CountAsync(b =>
                b.Status == BookingStatus.CheckedOut
                && b.ArchivedAtUtc != null
                && b.ArchivedAtUtc >= fromUtc && b.ArchivedAtUtc <= toUtc, cancellationToken);

        var cancelled = await _db.Bookings.AsNoTracking()
            .CountAsync(b =>
                b.Status == BookingStatus.Cancelled
                && b.UpdatedAtUtc >= fromUtc && b.UpdatedAtUtc <= toUtc, cancellationToken);

        var needingAssign = await _db.Bookings.AsNoTracking()
            .Include(b => b.Items)
                .ThenInclude(i => i.RoomAssignments)
            .Where(b => !b.IsArchived && b.Status == BookingStatus.Confirmed)
            .ToListAsync(cancellationToken);
        var roomsNeeding = needingAssign.Count(b =>
            b.Items.Sum(i => i.Quantity) > b.Items.Sum(i => i.RoomAssignments.Count));

        var todayStart = PhilippinesTime.StartOfTodayUtc();
        var tomorrowStart = todayStart.AddDays(1);
        var arrivalsToday = await _db.Bookings.AsNoTracking()
            .CountAsync(b =>
                !b.IsArchived
                && b.Status != BookingStatus.Cancelled
                && b.CheckInAtUtc >= todayStart && b.CheckInAtUtc < tomorrowStart,
                cancellationToken);
        var departuresToday = await _db.Bookings.AsNoTracking()
            .CountAsync(b =>
                !b.IsArchived
                && b.Status == BookingStatus.Confirmed
                && b.CheckoutTimeUtc >= todayStart && b.CheckoutTimeUtc < tomorrowStart,
                cancellationToken);

        var now = DateTime.UtcNow;
        var activeOffers = await _db.SpecialOffers.AsNoTracking()
            .Where(o => o.IsActive && o.StartsAtUtc <= now && o.EndsAtUtc >= now)
            .OrderBy(o => o.Title)
            .ToListAsync(cancellationToken);

        var offerTitles = activeOffers
            .Select(o => o.Title)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

        var offersTouched = await _db.SystemAuditLogs.AsNoTracking()
            .CountAsync(a =>
                a.Domain == SystemAuditDomain.SpecialOffer
                && a.AtUtc >= fromUtc && a.AtUtc <= toUtc, cancellationToken);

        return new StaffShiftOpsDto(
            created,
            confirmed,
            checkedOut,
            cancelled,
            roomsNeeding,
            arrivalsToday,
            departuresToday,
            offerTitles.Count,
            offersTouched,
            offerTitles);
    }

    private static string? TrimOrNull(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
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

    private sealed record ShiftSummaryPayload(StaffShiftGainDto Gain, StaffShiftOpsDto Ops);
}
