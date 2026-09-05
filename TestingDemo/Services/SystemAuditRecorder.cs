using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface ISystemAuditRecorder
{
    AuditActor CurrentActor(string? userId = null, string? displayName = null);

    /// <summary>Adds an append-only row. Caller must <c>SaveChanges</c> in the same transaction.</summary>
    void Record(
        SystemAuditIntent intent,
        SystemAuditDomain domain,
        string action,
        string targetType,
        string targetId,
        string targetLabel,
        string? reason = null,
        string? summary = null,
        string? actorUserId = null,
        string? actorDisplayName = null);

    Task RecordCommittedAsync(
        SystemAuditIntent intent,
        SystemAuditDomain domain,
        string action,
        string targetType,
        string targetId,
        string targetLabel,
        string? reason = null,
        string? summary = null,
        string? actorUserId = null,
        string? actorDisplayName = null,
        CancellationToken cancellationToken = default);
}

public interface ISystemAuditQuery
{
    Task<PagedSystemAuditLogsDto> GetPagedAsync(
        string? search,
        SystemAuditIntent? intent,
        SystemAuditDomain? domain,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SystemAuditSuggestionDto>> SuggestAsync(
        string? search,
        SystemAuditDomain? domain,
        int take = 8,
        CancellationToken cancellationToken = default);

    Task<(IReadOnlyList<SystemAuditLog> Items, int Total)> GetStaffAccountActivityAsync(
        string userId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default);

    Task<Dictionary<string, DateTime?>> GetStaffDisabledStateMapAsync(
        IReadOnlyCollection<string> userIds,
        CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SystemAuditLog>> GetStaffAccountAuditExportRowsAsync(
        CancellationToken cancellationToken = default);
}

public sealed class SystemAuditRecorder : ISystemAuditRecorder, ISystemAuditQuery
{
    public const int DefaultPageSize = 15;

    private readonly HotelBookingDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly UserManager<ApplicationUser> _users;

    public SystemAuditRecorder(
        HotelBookingDbContext db,
        IHttpContextAccessor http,
        UserManager<ApplicationUser> users)
    {
        _db = db;
        _http = http;
        _users = users;
    }

    public AuditActor CurrentActor(string? userId = null, string? displayName = null)
    {
        if (!string.IsNullOrWhiteSpace(userId))
        {
            var actorId = userId.Trim();
            var name = string.IsNullOrWhiteSpace(displayName)
                ? ResolveDisplayName(actorId, actorId)
                : displayName.Trim();
            return new AuditActor(actorId, Clip(name, 120));
        }

        var principal = _http.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return new AuditActor("system", "System");
        }

        var id = _users.GetUserId(principal)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? "unknown";
        var resolved = ResolveDisplayName(id, principal.Identity?.Name);
        var overrideName = string.IsNullOrWhiteSpace(displayName) ? resolved : displayName.Trim();
        return new AuditActor(id, Clip(overrideName, 120));
    }

    public void Record(
        SystemAuditIntent intent,
        SystemAuditDomain domain,
        string action,
        string targetType,
        string targetId,
        string targetLabel,
        string? reason = null,
        string? summary = null,
        string? actorUserId = null,
        string? actorDisplayName = null)
    {
        var actor = CurrentActor(actorUserId, actorDisplayName);
        var clippedReason = ClipOrNull(reason, 500);
        _db.SystemAuditLogs.Add(new SystemAuditLog
        {
            AtUtc = DateTime.UtcNow,
            Intent = intent,
            Domain = domain,
            Action = Clip(action, 80),
            ActorUserId = Clip(actor.UserId, 450),
            ActorDisplayName = actor.DisplayName,
            TargetType = Clip(targetType, 40),
            TargetId = Clip(targetId, 80),
            TargetLabel = Clip(targetLabel, 200),
            Reason = clippedReason,
            Summary = Clip(summary ?? clippedReason ?? action, 500)
        });
    }

    public async Task RecordCommittedAsync(
        SystemAuditIntent intent,
        SystemAuditDomain domain,
        string action,
        string targetType,
        string targetId,
        string targetLabel,
        string? reason = null,
        string? summary = null,
        string? actorUserId = null,
        string? actorDisplayName = null,
        CancellationToken cancellationToken = default)
    {
        Record(
            intent,
            domain,
            action,
            targetType,
            targetId,
            targetLabel,
            reason,
            summary,
            actorUserId,
            actorDisplayName);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<PagedSystemAuditLogsDto> GetPagedAsync(
        string? search,
        SystemAuditIntent? intent,
        SystemAuditDomain? domain,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.SystemAuditLogs.AsNoTracking().AsQueryable();
        if (intent.HasValue)
        {
            query = query.Where(row => row.Intent == intent.Value);
        }

        if (domain.HasValue)
        {
            query = query.Where(row => row.Domain == domain.Value);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            query = query.Where(row =>
                row.Action.Contains(term)
                || row.ActorDisplayName.Contains(term)
                || row.TargetLabel.Contains(term)
                || row.TargetId.Contains(term)
                || (row.Reason != null && row.Reason.Contains(term))
                || row.Summary.Contains(term));
        }

        var total = await query.CountAsync(cancellationToken);
        var rows = await query
            .OrderByDescending(row => row.AtUtc)
            .ThenByDescending(row => row.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedSystemAuditLogsDto(
            await MapPageAsync(rows, cancellationToken),
            page,
            pageSize,
            total);
    }

    public async Task<IReadOnlyList<SystemAuditSuggestionDto>> SuggestAsync(
        string? search,
        SystemAuditDomain? domain,
        int take = 8,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 12);
        var term = search?.Trim() ?? string.Empty;
        if (term.Length < 1)
        {
            return Array.Empty<SystemAuditSuggestionDto>();
        }

        var query = _db.SystemAuditLogs.AsNoTracking().AsQueryable();
        if (domain.HasValue)
        {
            query = query.Where(row => row.Domain == domain.Value);
        }

        var rows = await query
            .Where(row =>
                row.Action.Contains(term)
                || row.ActorDisplayName.Contains(term)
                || row.TargetLabel.Contains(term)
                || row.TargetId.Contains(term)
                || (row.Reason != null && row.Reason.Contains(term))
                || row.Summary.Contains(term))
            .OrderByDescending(row => row.AtUtc)
            .Select(row => new
            {
                row.Action,
                row.ActorDisplayName,
                row.TargetLabel,
                row.TargetId,
                row.Reason,
                row.Summary,
                row.Domain
            })
            .Take(40)
            .ToListAsync(cancellationToken);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<SystemAuditSuggestionDto>(take);
        foreach (var row in rows)
        {
            foreach (var candidate in SuggestionCandidates(row.TargetId, row.TargetLabel, row.ActorDisplayName, row.Action, row.Reason, row.Summary, row.Domain, term))
            {
                if (!seen.Add(candidate.Value))
                {
                    continue;
                }

                results.Add(candidate);
                if (results.Count >= take)
                {
                    return results;
                }
            }
        }

        return results;
    }

    public async Task<(IReadOnlyList<SystemAuditLog> Items, int Total)> GetStaffAccountActivityAsync(
        string userId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.SystemAuditLogs.AsNoTracking()
            .Where(row => row.Domain == SystemAuditDomain.Account && row.TargetId == userId);

        var rows = await query
            .OrderByDescending(row => row.AtUtc)
            .ThenByDescending(row => row.Id)
            .ToListAsync(cancellationToken);

        var filtered = rows
            .Where(row => StaffAccountActivityMapper.IsAccountActivityAction(row.Action))
            .ToList();

        var total = filtered.Count;
        var items = filtered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return (items, total);
    }

    public async Task<Dictionary<string, DateTime?>> GetStaffDisabledStateMapAsync(
        IReadOnlyCollection<string> userIds,
        CancellationToken cancellationToken = default)
    {
        if (userIds.Count == 0)
            return new Dictionary<string, DateTime?>(StringComparer.Ordinal);

        var logs = await _db.SystemAuditLogs.AsNoTracking()
            .Where(row =>
                row.Domain == SystemAuditDomain.Account
                && userIds.Contains(row.TargetId)
                && (row.Action == "Account.Disabled"
                    || row.Action == "Account.Enabled"
                    || row.Action == "Disabled"
                    || row.Action == "Enabled"))
            .OrderByDescending(row => row.AtUtc)
            .Select(row => new { row.TargetId, row.Action, row.AtUtc })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<string, DateTime?>(StringComparer.Ordinal);
        foreach (var log in logs)
        {
            if (result.ContainsKey(log.TargetId))
                continue;

            var key = StaffAccountActivityMapper.NormalizeActionKey(log.Action);
            result[log.TargetId] = key == "Disabled" ? log.AtUtc : null;
        }

        return result;
    }

    public async Task<IReadOnlyList<SystemAuditLog>> GetStaffAccountAuditExportRowsAsync(
        CancellationToken cancellationToken = default)
    {
        return await _db.SystemAuditLogs.AsNoTracking()
            .Where(row => row.Domain == SystemAuditDomain.Account)
            .OrderByDescending(row => row.AtUtc)
            .ThenByDescending(row => row.Id)
            .ToListAsync(cancellationToken);
    }

    private string ResolveDisplayName(string userId, string? fallback)
    {
        var local = _db.Users.Local.FirstOrDefault(u => u.Id == userId);
        if (!string.IsNullOrWhiteSpace(local?.FullName))
        {
            return local.FullName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(local?.UserName))
        {
            return local.UserName;
        }

        var fromDb = _db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.FullName ?? u.UserName)
            .FirstOrDefault();

        if (!string.IsNullOrWhiteSpace(fromDb))
        {
            return fromDb.Trim();
        }

        return string.IsNullOrWhiteSpace(fallback) ? userId : fallback;
    }

    internal static string IntentLabel(SystemAuditIntent intent) => intent switch
    {
        SystemAuditIntent.AdministrativeAction => "Administrative action",
        SystemAuditIntent.ConfigurationChange => "Configuration",
        SystemAuditIntent.FileModification => "File modification",
        _ => intent.ToString()
    };

    internal static string DomainLabel(SystemAuditDomain domain) => domain switch
    {
        SystemAuditDomain.Payment => "Payments",
        SystemAuditDomain.Account => "Accounts",
        SystemAuditDomain.Booking => "Bookings",
        SystemAuditDomain.SpecialOffer => "Special offers",
        SystemAuditDomain.Configuration => "Configuration",
        SystemAuditDomain.File => "Files",
        SystemAuditDomain.Shift => "Shifts",
        _ => domain.ToString()
    };

    private async Task<IReadOnlyList<SystemAuditLogDto>> MapPageAsync(
        IReadOnlyList<SystemAuditLog> rows,
        CancellationToken cancellationToken)
    {
        var staffIds = rows
            .Where(row => IsStaffUserTarget(row.TargetType))
            .Select(row => row.TargetId)
            .Concat(rows.Where(row => LooksLikeUserId(row.ActorDisplayName) || LooksLikeUserId(row.ActorUserId))
                .Select(row => row.ActorUserId))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        Dictionary<string, string> names = new(StringComparer.Ordinal);
        if (staffIds.Count > 0)
        {
            var found = await _db.Users.AsNoTracking()
                .Where(user => staffIds.Contains(user.Id))
                .Select(user => new { user.Id, Label = user.FullName ?? user.UserName })
                .ToListAsync(cancellationToken);
            foreach (var user in found)
            {
                if (!string.IsNullOrWhiteSpace(user.Label))
                    names[user.Id] = user.Label.Trim();
            }
        }

        return rows.Select(row =>
        {
            var actorName = row.ActorDisplayName;
            if (names.TryGetValue(row.ActorUserId, out var resolvedActor)
                && (string.IsNullOrWhiteSpace(actorName) || LooksLikeUserId(actorName)))
            {
                actorName = resolvedActor;
            }

            var targetLabel = row.TargetLabel;
            if (IsStaffUserTarget(row.TargetType)
                && names.TryGetValue(row.TargetId, out var resolvedTarget)
                && (string.IsNullOrWhiteSpace(targetLabel) || LooksLikeUserId(targetLabel)))
            {
                targetLabel = resolvedTarget;
            }

            return Map(row, actorName, targetLabel);
        }).ToList();
    }

    private static bool LooksLikeUserId(string? value) =>
        Guid.TryParse(value, out _);

    private static bool IsStaffUserTarget(string? targetType) =>
        string.Equals(targetType, StaffAuthSchema.AuditTargetType, StringComparison.Ordinal)
        || string.Equals(targetType, "StaffAccount", StringComparison.Ordinal);

    private static SystemAuditLogDto Map(
        SystemAuditLog row,
        string? actorDisplayName = null,
        string? targetLabel = null) =>
        new(
            row.Id,
            row.AtUtc,
            row.Intent,
            IntentLabel(row.Intent),
            row.Domain,
            DomainLabel(row.Domain),
            row.Action,
            row.ActorUserId,
            actorDisplayName ?? row.ActorDisplayName,
            row.TargetType,
            row.TargetId,
            targetLabel ?? row.TargetLabel,
            row.Reason,
            row.Summary);

    private static string Clip(string? value, int max)
    {
        var text = (value ?? string.Empty).Trim();
        if (text.Length == 0)
        {
            return string.Empty;
        }

        return text.Length <= max ? text : text[..max];
    }

    private static IEnumerable<SystemAuditSuggestionDto> SuggestionCandidates(
        string targetId,
        string targetLabel,
        string actor,
        string action,
        string? reason,
        string summary,
        SystemAuditDomain domain,
        string term)
    {
        var area = DomainLabel(domain);
        if (ContainsTerm(targetId, term))
        {
            yield return new SystemAuditSuggestionDto(targetId, targetId, area);
        }

        if (ContainsTerm(targetLabel, term) && !string.Equals(targetLabel, targetId, StringComparison.OrdinalIgnoreCase))
        {
            yield return new SystemAuditSuggestionDto(targetLabel, targetLabel, area);
        }

        if (ContainsTerm(actor, term))
        {
            yield return new SystemAuditSuggestionDto(actor, actor, "Staff");
        }

        if (ContainsTerm(action, term))
        {
            yield return new SystemAuditSuggestionDto(action, action, area);
        }

        var note = string.IsNullOrWhiteSpace(reason) ? summary : reason;
        if (ContainsTerm(note, term))
        {
            yield return new SystemAuditSuggestionDto(note, Clip(note, 80), "Reason");
        }
    }

    private static bool ContainsTerm(string? value, string term) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Contains(term, StringComparison.OrdinalIgnoreCase);

    private static string? ClipOrNull(string? value, int max)
    {
        var text = Clip(value, max);
        return text.Length == 0 ? null : text;
    }
}
