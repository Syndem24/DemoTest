using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface ISpecialOfferService
{
    Task<IReadOnlyList<SpecialOfferDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SpecialOfferDto>> GetCurrentAsync(CancellationToken cancellationToken = default);
    Task<SpecialOfferDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<int>> GetSiblingRoomTypeIdsAsync(int id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SpecialOfferDto>> GetActiveForGuestAsync(
        int? roomTypeId = null,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SpecialOfferDto>> GetActiveForWalkInAsync(
        int? roomTypeId = null,
        CancellationToken cancellationToken = default);
    Task<IReadOnlyList<SpecialOfferDto>> CreateAsync(UpsertSpecialOfferRequest request, CancellationToken cancellationToken = default);
    Task<SpecialOfferDto?> UpdateAsync(int id, UpsertSpecialOfferRequest request, CancellationToken cancellationToken = default);
    Task<bool> DeactivateAsync(int id, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default);
    Task<SpecialOfferDto?> ReactivateAsync(
        int id,
        ReactivateSpecialOfferRequest request,
        CancellationToken cancellationToken = default);
    Task<SpecialOffer?> GetApplicableWalkInPromoAsync(
        int roomTypeId,
        DateTime stayStartUtc,
        DateTime stayEndUtc,
        int nights,
        CancellationToken cancellationToken = default);
    Task ExpireEndedOffersAsync(CancellationToken cancellationToken = default);
}

public sealed class SpecialOfferService : ISpecialOfferService
{
    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;
    private readonly IGuestCatalogNotifier _guestCatalog;

    public SpecialOfferService(
        HotelBookingDbContext db,
        ISystemAuditRecorder audit,
        IGuestCatalogNotifier guestCatalog)
    {
        _db = db;
        _audit = audit;
        _guestCatalog = guestCatalog;
    }

    private void AuditOffer(string action, string targetId, string targetLabel, string summary)
    {
        _audit.Record(
            SystemAuditIntent.ConfigurationChange,
            SystemAuditDomain.SpecialOffer,
            action,
            "SpecialOffer",
            targetId,
            targetLabel,
            summary: summary);
    }

    public async Task ExpireEndedOffersAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var ended = await _db.SpecialOffers
            .Where(o => o.IsActive && o.EndsAtUtc < now)
            .ToListAsync(cancellationToken);
        if (ended.Count == 0)
            return;

        foreach (var offer in ended)
        {
            offer.IsActive = false;
            offer.UpdatedAtUtc = now;
        }

        var campaigns = ended
            .GroupBy(o => $"{o.Kind}|{o.Title}|{o.StartsAtUtc:O}|{o.EndsAtUtc:O}");

        foreach (var campaign in campaigns)
        {
            var first = campaign.First();
            AuditOffer(
                "Offer.Expired",
                first.Id.ToString(),
                first.Title,
                "Special offer ended and was deactivated automatically.");
        }

        await _db.SaveChangesAsync(cancellationToken);
        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);
    }

    public async Task<IReadOnlyList<SpecialOfferDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        await ExpireEndedOffersAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var rows = await _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .OrderByDescending(o => o.StartsAtUtc)
            .ThenBy(o => o.Title)
            .ToListAsync(cancellationToken);
        return rows.Select(o => Map(o, now)).ToList();
    }

    public async Task<IReadOnlyList<SpecialOfferDto>> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var rows = await _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .Where(o => o.IsActive && o.StartsAtUtc <= now && o.EndsAtUtc >= now)
            .OrderBy(o => o.Title)
            .ToListAsync(cancellationToken);
        return rows.Select(o => Map(o, now)).ToList();
    }

    public async Task<SpecialOfferDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var row = await _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        return row is null ? null : Map(row, DateTime.UtcNow);
    }

    public async Task<IReadOnlyList<int>> GetSiblingRoomTypeIdsAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var current = await _db.SpecialOffers.AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (current is null) return [];

        return await _db.SpecialOffers.AsNoTracking()
            .Where(o => o.Title == current.Title
                && o.Kind == current.Kind
                && o.StartsAtUtc == current.StartsAtUtc
                && o.EndsAtUtc == current.EndsAtUtc)
            .Select(o => o.RoomTypeId)
            .Distinct()
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SpecialOfferDto>> GetActiveForGuestAsync(
        int? roomTypeId = null,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var query = _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .Where(o => o.IsActive
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore)
                && (o.Channels & SpecialOfferChannels.OnlineVisible) != 0);

        if (roomTypeId is > 0)
            query = query.Where(o => o.RoomTypeId == roomTypeId);

        var rows = await query
            .OrderBy(o => o.Title)
            .ToListAsync(cancellationToken);
        return rows.Select(o => Map(o, now)).ToList();
    }

    public async Task<IReadOnlyList<SpecialOfferDto>> GetActiveForWalkInAsync(
        int? roomTypeId = null,
        CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var query = _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .Where(o => o.IsActive
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && o.PromoPricePerNight != null
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore)
                && (o.Channels & SpecialOfferChannels.WalkIn) != 0);

        if (roomTypeId is > 0)
            query = query.Where(o => o.RoomTypeId == roomTypeId);

        var rows = await query
            .OrderBy(o => o.PromoPricePerNight)
            .ThenBy(o => o.Title)
            .ToListAsync(cancellationToken);
        return rows.Select(o => Map(o, now)).ToList();
    }

    public async Task<IReadOnlyList<SpecialOfferDto>> CreateAsync(
        UpsertSpecialOfferRequest request,
        CancellationToken cancellationToken = default)
    {
        NormalizeRoomTypeIds(request);
        ValidateShared(request);
        ValidateOfferWindow(request, allowPastStartIfUnchanged: false, existingStartUtc: null, existingEndUtc: null);

        var now = DateTime.UtcNow;
        var startUtc = PhilippinesTime.ToUtc(request.StartsAtUtc);
        var endUtc = PhilippinesTime.ToUtc(request.EndsAtUtc);

        if (request.IsActive)
            await EnsureNoActiveKindConflictAsync(request.Kind, excludeIds: null, cancellationToken);

        var created = new List<SpecialOffer>();

        foreach (var roomTypeId in request.RoomTypeIds)
        {
            request.RoomTypeId = roomTypeId;
            await ApplyRoomTypePricingAsync(request, cancellationToken);

            var entity = new SpecialOffer
            {
                RoomTypeId = roomTypeId,
                Kind = request.Kind,
                Title = request.Title.Trim(),
                Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
                RegularPricePerNight = decimal.Round(request.RegularPricePerNight, 2),
                PromoPricePerNight = request.PromoPricePerNight is null
                    ? null
                    : decimal.Round(request.PromoPricePerNight.Value, 2),
                MinNights = request.Kind == SpecialOfferKind.StayLongerSaveMore
                    ? request.MinNights
                    : null,
                Channels = request.Channels,
                CashOnly = request.CashOnly,
                IsActive = request.IsActive,
                StartsAtUtc = startUtc,
                EndsAtUtc = endUtc,
                SortOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };
            _db.SpecialOffers.Add(entity);
            created.Add(entity);
        }

        await _db.SaveChangesAsync(cancellationToken);
        foreach (var entity in created)
            await _db.Entry(entity).Reference(e => e.RoomType).LoadAsync(cancellationToken);

        var first = created[0];
        AuditOffer(
            "Offer.Created",
            first.Id.ToString(),
            first.Title,
            $"Special offer created ({created.Count} room type row(s)).");
        await _db.SaveChangesAsync(cancellationToken);

        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);
        return created.Select(e => Map(e, now)).ToList();
    }

    public async Task<SpecialOfferDto?> UpdateAsync(
        int id,
        UpsertSpecialOfferRequest request,
        CancellationToken cancellationToken = default)
    {
        NormalizeRoomTypeIds(request);
        ValidateShared(request);

        var current = await _db.SpecialOffers
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (current is null) return null;

        var oldTitle = current.Title;
        var oldKind = current.Kind;
        var oldStart = current.StartsAtUtc;
        var oldEnd = current.EndsAtUtc;

        ValidateOfferWindow(
            request,
            allowPastStartIfUnchanged: true,
            existingStartUtc: oldStart,
            existingEndUtc: oldEnd);

        var siblings = await _db.SpecialOffers
            .Where(o => o.Title == oldTitle
                && o.Kind == oldKind
                && o.StartsAtUtc == oldStart
                && o.EndsAtUtc == oldEnd)
            .ToListAsync(cancellationToken);

        var selected = request.RoomTypeIds.ToHashSet();
        var now = DateTime.UtcNow;
        var startUtc = PhilippinesTime.ToUtc(request.StartsAtUtc);
        var endUtc = PhilippinesTime.ToUtc(request.EndsAtUtc);

        if (request.IsActive)
        {
            await EnsureNoActiveKindConflictAsync(
                request.Kind,
                excludeIds: siblings.Select(s => s.Id).ToList(),
                cancellationToken);
        }

        foreach (var sibling in siblings)
        {
            if (!selected.Contains(sibling.RoomTypeId))
            {
                sibling.IsActive = false;
                sibling.UpdatedAtUtc = now;
                continue;
            }

            request.RoomTypeId = sibling.RoomTypeId;
            await ApplyRoomTypePricingAsync(request, cancellationToken);
            ApplyFields(sibling, request, startUtc, endUtc, now);
            selected.Remove(sibling.RoomTypeId);
        }

        foreach (var roomTypeId in selected)
        {
            request.RoomTypeId = roomTypeId;
            await ApplyRoomTypePricingAsync(request, cancellationToken);
            _db.SpecialOffers.Add(new SpecialOffer
            {
                RoomTypeId = roomTypeId,
                Kind = request.Kind,
                Title = request.Title.Trim(),
                Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
                RegularPricePerNight = decimal.Round(request.RegularPricePerNight, 2),
                PromoPricePerNight = request.PromoPricePerNight is null
                    ? null
                    : decimal.Round(request.PromoPricePerNight.Value, 2),
                MinNights = request.Kind == SpecialOfferKind.StayLongerSaveMore
                    ? request.MinNights
                    : null,
                Channels = request.Channels,
                CashOnly = request.CashOnly,
                IsActive = request.IsActive,
                StartsAtUtc = startUtc,
                EndsAtUtc = endUtc,
                SortOrder = 0,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            });
        }

        AuditOffer(
            "Offer.Updated",
            id.ToString(),
            request.Title.Trim(),
            "Special offer configuration updated.");
        await _db.SaveChangesAsync(cancellationToken);

        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);

        // Prefer the edited row even when inactive (deactivate → edit → save must not 404).
        var primary = await _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);

        if (primary is null)
        {
            primary = await _db.SpecialOffers.AsNoTracking()
                .Include(o => o.RoomType)
                .Where(o => o.Title == request.Title.Trim()
                    && o.Kind == request.Kind
                    && o.StartsAtUtc == startUtc
                    && o.EndsAtUtc == endUtc)
                .OrderByDescending(o => o.IsActive)
                .ThenBy(o => o.RoomTypeId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        return primary is null ? null : Map(primary, now);
    }

    public async Task<bool> DeactivateAsync(int id, CancellationToken cancellationToken = default)
    {
        var entity = await _db.SpecialOffers.FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (entity is null) return false;

        var siblings = await _db.SpecialOffers
            .Where(o => o.Title == entity.Title
                && o.Kind == entity.Kind
                && o.StartsAtUtc == entity.StartsAtUtc
                && o.EndsAtUtc == entity.EndsAtUtc)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var sibling in siblings)
        {
            sibling.IsActive = false;
            sibling.UpdatedAtUtc = now;
        }

        AuditOffer(
            "Offer.Deactivated",
            entity.Id.ToString(),
            entity.Title,
            "Special offer deactivated.");
        await _db.SaveChangesAsync(cancellationToken);
        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var entity = await _db.SpecialOffers.FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (entity is null) return false;

        var siblings = await _db.SpecialOffers
            .Where(o => o.Title == entity.Title
                && o.Kind == entity.Kind
                && o.StartsAtUtc == entity.StartsAtUtc
                && o.EndsAtUtc == entity.EndsAtUtc)
            .ToListAsync(cancellationToken);

        _db.SpecialOffers.RemoveRange(siblings);
        AuditOffer(
            "Offer.Deleted",
            entity.Id.ToString(),
            entity.Title,
            "Special offer deleted.");
        await _db.SaveChangesAsync(cancellationToken);
        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);
        return true;
    }

    public async Task<SpecialOfferDto?> ReactivateAsync(
        int id,
        ReactivateSpecialOfferRequest request,
        CancellationToken cancellationToken = default)
    {
        var entity = await _db.SpecialOffers.FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (entity is null) return null;

        var startUtc = PhilippinesTime.ToUtc(request.StartsAtUtc);
        var endUtc = PhilippinesTime.ToUtc(request.EndsAtUtc);
        var nowUtc = DateTime.UtcNow.AddMinutes(-1);
        if (startUtc < nowUtc)
            throw new ArgumentException("Reactivation start cannot be in the past (Manila time).");
        if (endUtc <= startUtc)
            throw new ArgumentException("Reactivation end must be after start.");
        if (endUtc < nowUtc)
            throw new ArgumentException("Reactivation end cannot be in the past (Manila time).");

        var siblings = await _db.SpecialOffers
            .Where(o => o.Title == entity.Title
                && o.Kind == entity.Kind
                && o.StartsAtUtc == entity.StartsAtUtc
                && o.EndsAtUtc == entity.EndsAtUtc)
            .ToListAsync(cancellationToken);

        await EnsureNoActiveKindConflictAsync(
            entity.Kind,
            excludeIds: siblings.Select(s => s.Id).ToList(),
            cancellationToken);

        var now = DateTime.UtcNow;
        foreach (var sibling in siblings)
        {
            sibling.IsActive = true;
            sibling.StartsAtUtc = startUtc;
            sibling.EndsAtUtc = endUtc;
            sibling.UpdatedAtUtc = now;
        }

        AuditOffer(
            "Offer.Reactivated",
            entity.Id.ToString(),
            entity.Title,
            "Special offer reactivated.");
        await _db.SaveChangesAsync(cancellationToken);

        await _guestCatalog.NotifyChangedAsync("offers", cancellationToken);

        var primary = await _db.SpecialOffers.AsNoTracking()
            .Include(o => o.RoomType)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
        return primary is null ? null : Map(primary, now);
    }

    public async Task<SpecialOffer?> GetApplicableWalkInPromoAsync(
        int roomTypeId,
        DateTime stayStartUtc,
        DateTime stayEndUtc,
        int nights,
        CancellationToken cancellationToken = default)
    {
        _ = stayStartUtc;
        _ = stayEndUtc;
        var now = DateTime.UtcNow;
        var candidates = await _db.SpecialOffers
            .Where(o => o.RoomTypeId == roomTypeId
                && o.IsActive
                && o.StartsAtUtc <= now
                && o.EndsAtUtc >= now
                && o.PromoPricePerNight != null
                && (o.Kind == SpecialOfferKind.LimitedTime
                    || o.Kind == SpecialOfferKind.StayLongerSaveMore)
                && (o.Channels & SpecialOfferChannels.WalkIn) != 0)
            .OrderBy(o => o.PromoPricePerNight)
            .ToListAsync(cancellationToken);

        return candidates.FirstOrDefault(o => IsEligibleForStay(o, nights));
    }

    private static void NormalizeRoomTypeIds(UpsertSpecialOfferRequest request)
    {
        request.RoomTypeIds = (request.RoomTypeIds ?? [])
            .Where(id => id > 0)
            .Distinct()
            .ToList();
        if (request.RoomTypeIds.Count == 0 && request.RoomTypeId > 0)
            request.RoomTypeIds.Add(request.RoomTypeId);
        if (request.RoomTypeIds.Count > 0)
            request.RoomTypeId = request.RoomTypeIds[0];

        request.Title = TitleForKind(request.Kind);
    }

    public static string TitleForKind(SpecialOfferKind kind) => kind switch
    {
        SpecialOfferKind.LimitedTime => "Limited time",
        SpecialOfferKind.StayLongerSaveMore => "Stay longer, save more",
        SpecialOfferKind.BestAvailableRate => "Best available rate",
        SpecialOfferKind.BookNowStayLater => "Book now, stay later",
        SpecialOfferKind.MonthlyStay => "Monthly stay",
        _ => kind.ToString()
    };

    private static void ApplyFields(
        SpecialOffer entity,
        UpsertSpecialOfferRequest request,
        DateTime startUtc,
        DateTime endUtc,
        DateTime nowUtc)
    {
        entity.Kind = request.Kind;
        entity.Title = request.Title.Trim();
        entity.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        entity.RegularPricePerNight = decimal.Round(request.RegularPricePerNight, 2);
        entity.PromoPricePerNight = request.PromoPricePerNight is null
            ? null
            : decimal.Round(request.PromoPricePerNight.Value, 2);
        entity.MinNights = request.Kind == SpecialOfferKind.StayLongerSaveMore
            ? request.MinNights
            : null;
        entity.Channels = request.Channels;
        entity.CashOnly = request.CashOnly;
        entity.IsActive = request.IsActive;
        entity.StartsAtUtc = startUtc;
        entity.EndsAtUtc = endUtc;
        entity.UpdatedAtUtc = nowUtc;
    }

    private async Task ApplyRoomTypePricingAsync(
        UpsertSpecialOfferRequest request,
        CancellationToken cancellationToken)
    {
        var roomType = await _db.RoomTypes.AsNoTracking()
            .FirstOrDefaultAsync(t => t.RoomTypeId == request.RoomTypeId, cancellationToken);
        if (roomType is null)
            throw new ArgumentException("Room type was not found.");

        var baseRate = decimal.Round(roomType.PricePerNight, 2);
        if (baseRate <= 0)
            throw new ArgumentException("Room type base price must be greater than zero.");

        request.RegularPricePerNight = baseRate;

        if (request.Kind is SpecialOfferKind.LimitedTime or SpecialOfferKind.StayLongerSaveMore)
        {
            if (request.DiscountPercent is null
                || request.DiscountPercent is < 0.01m or > 99.99m)
            {
                throw new ArgumentException(
                    request.Kind == SpecialOfferKind.StayLongerSaveMore
                        ? "Stay Longer offers require a discount between 0.01% and 99.99%."
                        : "Limited Time offers require a discount between 0.01% and 99.99%.");
            }

            var promo = decimal.Round(baseRate * (1m - request.DiscountPercent.Value / 100m), 2);
            if (promo <= 0 || promo >= baseRate)
                throw new ArgumentException("Discount must produce a promo price lower than the room type base.");

            request.PromoPricePerNight = promo;
        }
        else
        {
            request.PromoPricePerNight = null;
        }
    }

    /// <summary>
    /// Only one active campaign per kind (Limited Time / Stay Longer). Sibling room-type rows are one campaign.
    /// </summary>
    private async Task EnsureNoActiveKindConflictAsync(
        SpecialOfferKind kind,
        IReadOnlyCollection<int>? excludeIds,
        CancellationToken cancellationToken)
    {
        var query = _db.SpecialOffers.AsNoTracking()
            .Where(o => o.IsActive && o.Kind == kind);
        if (excludeIds is { Count: > 0 })
            query = query.Where(o => !excludeIds.Contains(o.Id));

        var conflict = await query
            .Select(o => new { o.Id, o.Title })
            .FirstOrDefaultAsync(cancellationToken);
        if (conflict is null) return;

        var label = TitleForKind(kind);
        throw new ArgumentException(
            $"An active “{label}” offer already exists. Deactivate or delete it before saving another of the same kind.");
    }

    private static void ValidateShared(UpsertSpecialOfferRequest request)
    {
        if (request.Kind is not (SpecialOfferKind.LimitedTime or SpecialOfferKind.StayLongerSaveMore))
            throw new ArgumentException("Only Limited Time and Stay Longer Save More offers can be created.");

        if (request.RoomTypeIds.Count == 0)
            throw new ArgumentException("Select at least one room type.");

        if (request.Kind == SpecialOfferKind.StayLongerSaveMore
            && (request.MinNights is null or < 2 or > 365))
        {
            throw new ArgumentException("Stay Longer offers require a minimum stay between 2 and 365 nights.");
        }
    }

    /// <summary>
    /// Create/reactivate: start and end must be in the future. Edit: keeping the existing start (already live) is allowed.
    /// </summary>
    private static void ValidateOfferWindow(
        UpsertSpecialOfferRequest request,
        bool allowPastStartIfUnchanged,
        DateTime? existingStartUtc,
        DateTime? existingEndUtc)
    {
        var start = PhilippinesTime.ToUtc(request.StartsAtUtc);
        var end = PhilippinesTime.ToUtc(request.EndsAtUtc);
        var nowUtc = DateTime.UtcNow.AddMinutes(-1);

        if (end <= start)
            throw new ArgumentException("Offer end must be after start.");

        var startUnchanged = existingStartUtc is DateTime es
            && TruncateUtcToMinute(start) == TruncateUtcToMinute(AssumeUtc(es));
        var endUnchanged = existingEndUtc is DateTime ee
            && TruncateUtcToMinute(end) == TruncateUtcToMinute(AssumeUtc(ee));
        // On edit, allow past start so staff can update non-date fields for already running/ended windows.
        if (start < nowUtc && !allowPastStartIfUnchanged)
            throw new ArgumentException("Offer start cannot be in the past (Manila time).");

        // End may stay as-is when editing a live offer; a newly chosen end must still be in the future.
        if (end < nowUtc && !endUnchanged)
            throw new ArgumentException("Offer end cannot be in the past (Manila time).");
    }

    private static DateTime AssumeUtc(DateTime value) =>
        value.Kind == DateTimeKind.Utc
            ? value
            : DateTime.SpecifyKind(value, DateTimeKind.Utc);

    private static DateTime TruncateUtcToMinute(DateTime value)
    {
        var utc = AssumeUtc(value);
        return new DateTime(utc.Year, utc.Month, utc.Day, utc.Hour, utc.Minute, 0, DateTimeKind.Utc);
    }

    internal static bool IsEligibleForStay(SpecialOffer offer, int nights)
    {
        if (offer.PromoPricePerNight is null) return false;
        if (offer.Kind == SpecialOfferKind.LimitedTime) return true;
        if (offer.Kind == SpecialOfferKind.StayLongerSaveMore)
            return offer.MinNights is int min && nights >= min;
        return false;
    }

    private static SpecialOfferDto Map(SpecialOffer o, DateTime nowUtc) => new()
    {
        Id = o.Id,
        RoomTypeId = o.RoomTypeId,
        RoomTypeName = o.RoomType?.Name ?? string.Empty,
        Kind = o.Kind,
        Title = o.Title,
        Description = o.Description,
        RegularPricePerNight = o.RegularPricePerNight,
        PromoPricePerNight = o.PromoPricePerNight,
        MinNights = o.MinNights,
        Channels = o.Channels,
        CashOnly = o.CashOnly,
        IsActive = o.IsActive,
        // EF materializes datetime2 as Unspecified; mark as UTC for correct Manila conversion in UI.
        StartsAtUtc = DateTime.SpecifyKind(o.StartsAtUtc, DateTimeKind.Utc),
        EndsAtUtc = DateTime.SpecifyKind(o.EndsAtUtc, DateTimeKind.Utc),
        IsCurrentlyActive = o.IsActive && o.StartsAtUtc <= nowUtc && o.EndsAtUtc >= nowUtc
    };
}
