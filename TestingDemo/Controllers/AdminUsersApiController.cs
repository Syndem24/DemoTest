using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/users")]
[Authorize(Policy = "AdminManagerOnly")]
public sealed class AdminUsersApiController : ControllerBase
{
    private const string CreatedMessage = "Staff user created successfully.";

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IStaffAccountCreateService _createService;
    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;

    public AdminUsersApiController(
        UserManager<ApplicationUser> userManager,
        IStaffAccountCreateService createService,
        HotelBookingDbContext db,
        ISystemAuditRecorder audit)
    {
        _userManager = userManager;
        _createService = createService;
        _db = db;
        _audit = audit;
    }

    [HttpGet("list")]
    public async Task<IActionResult> List(
        string? q,
        string status = "all",
        int page = 1,
        int pageSize = 15,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 5, 50);
        q = (q ?? string.Empty).Trim();
        status = NormalizeStatus(status);

        IQueryable<UserListRow> query = _db.Users
            .AsNoTracking()
            .Select(u => new UserListRow
            {
                Id = u.Id,
                FullName = u.FullName,
                UserName = u.UserName ?? string.Empty,
                Email = u.Email ?? string.Empty,
                PhoneNumber = u.PhoneNumber,
                BirthDate = u.BirthDate,
                Address = u.Address,
                LockoutEnabled = u.LockoutEnabled,
                LockoutEnd = u.LockoutEnd,
                RoleName = _db.Roles
                    .Where(role => role.Id == u.RoleId)
                    .Select(role => role.Name)
                    .FirstOrDefault() ?? "Unassigned"
            });

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = $"%{q}%";
            query = query.Where(u =>
                EF.Functions.Like(u.UserName, term)
                || EF.Functions.Like(u.Email, term)
                || EF.Functions.Like(u.RoleName, term)
                || (u.FullName != null && EF.Functions.Like(u.FullName, term))
                || (u.PhoneNumber != null && EF.Functions.Like(u.PhoneNumber, term)));
        }

        if (status == "active")
        {
            query = query.Where(u => !(u.LockoutEnabled && u.LockoutEnd.HasValue));
        }
        else if (status == "disabled")
        {
            query = query.Where(u => u.LockoutEnabled && u.LockoutEnd.HasValue);
        }

        query = query.OrderBy(u => u.FullName ?? u.UserName);

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)pageSize);
        page = Math.Min(page, totalPages);

        var rows = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var disabledStates = await GetDisabledStateMapAsync(rows.Select(r => r.Id).ToArray(), cancellationToken);
        var items = rows.Select(u =>
        {
            var disabledAt = disabledStates.TryGetValue(u.Id, out var value) ? value : null;
            var isDisabled = IsDisabledByLockout(u.LockoutEnabled, u.LockoutEnd);
            return new
            {
                id = u.Id,
                fullName = u.FullName,
                userName = u.UserName,
                email = u.Email,
                phoneNumber = u.PhoneNumber,
                birthDate = u.BirthDate?.ToString("yyyy-MM-dd"),
                address = u.Address,
                role = u.RoleName,
                isDisabled,
                disabledAtUtc = disabledAt,
                canDeleteNow = isDisabled
            };
        }).ToList();

        var summary = await query
            .GroupBy(_ => 1)
            .Select(g => new
            {
                total = g.Count(),
                adminManagers = g.Count(x => x.RoleName == AppRoles.AdminManager),
                receptionists = g.Count(x => x.RoleName == AppRoles.Receptionist)
            })
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(new
        {
            items,
            page,
            pageSize,
            totalCount,
            totalPages,
            retentionDays = 0,
            summary = summary ?? new { total = 0, adminManagers = 0, receptionists = 0 }
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(
        [FromBody] CreateStaffUserDto dto,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Unauthorized();

        var result = await _createService.CreateAsync(
            dto,
            actor,
            token => Url.Action(
                nameof(GoogleVerificationController.Begin),
                "GoogleVerification",
                new { token },
                Request.Scheme)!,
            cancellationToken);

        if (result.InvalidRole)
            return BadRequest(new { message = "Invalid role." });

        if (result.InvalidBirthDate)
        {
            return BadRequest(new
            {
                message = "Enter a valid birth date (age 16–100).",
                field = "birthDate"
            });
        }

        if (result.StepUpFailed)
        {
            return BadRequest(new
            {
                message = "Re-authentication required to create an AdminManager.",
                field = "currentAdminPassword"
            });
        }

        if (result.PasswordErrors.Count > 0)
        {
            return BadRequest(new
            {
                message = result.PasswordErrors[0],
                field = "temporaryPassword",
                errors = new Dictionary<string, string[]>
                {
                    ["temporaryPassword"] = result.PasswordErrors.ToArray()
                }
            });
        }

        if (result.CollisionOrIdentityFailure || result.User is null)
        {
            if (!string.IsNullOrWhiteSpace(result.FailureMessage))
            {
                return BadRequest(new
                {
                    created = false,
                    field = result.FailureField,
                    message = result.FailureMessage
                });
            }

            return BadRequest(new
            {
                created = false,
                message = "Could not create this staff user. Check the details and try again."
            });
        }

        return Ok(new { created = true, message = CreatedMessage });
    }

    [HttpPost("{id}/disable")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Disable(string id, CancellationToken cancellationToken)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null) return Unauthorized();

        var target = await _userManager.FindByIdAsync(id);
        if (target is null) return NotFound(new { message = "User not found." });
        if (target.Id == actor.Id) return BadRequest(new { message = "You cannot disable your own account." });

        if (!target.LockoutEnabled)
        {
            var enableLockout = await _userManager.SetLockoutEnabledAsync(target, true);
            if (!enableLockout.Succeeded) return BadRequest(new { message = "Failed to disable user." });
        }

        var disabled = await _userManager.SetLockoutEndDateAsync(target, DateTimeOffset.MaxValue);
        if (!disabled.Succeeded) return BadRequest(new { message = "Failed to disable user." });

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        await AddAuditAsync("Disabled", target.Id, actor.Id, role, cancellationToken);
        return Ok(new { message = "User account disabled." });
    }

    [HttpPost("{id}/enable")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Enable(string id, CancellationToken cancellationToken)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null) return Unauthorized();

        var target = await _userManager.FindByIdAsync(id);
        if (target is null) return NotFound(new { message = "User not found." });

        var enabled = await _userManager.SetLockoutEndDateAsync(target, null);
        if (!enabled.Succeeded) return BadRequest(new { message = "Failed to enable user." });

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        await AddAuditAsync("Enabled", target.Id, actor.Id, role, cancellationToken);
        return Ok(new { message = "User account enabled." });
    }

    [HttpPost("{id}/delete")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(string id, CancellationToken cancellationToken)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null) return Unauthorized();

        var target = await _userManager.FindByIdAsync(id);
        if (target is null) return NotFound(new { message = "User not found." });
        if (target.Id == actor.Id) return BadRequest(new { message = "You cannot delete your own account." });

        if (!IsDisabledByLockout(target.LockoutEnabled, target.LockoutEnd))
            return BadRequest(new { message = "Disable the account before deletion." });

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        var deleted = await _userManager.DeleteAsync(target);
        if (!deleted.Succeeded) return BadRequest(new { message = "Failed to delete user account." });

        await AddAuditAsync("Deleted", target.Id, actor.Id, role, cancellationToken);
        return Ok(new { message = "User account permanently deleted." });
    }

    private async Task AddAuditAsync(
        string action,
        string targetUserId,
        string actorUserId,
        string role,
        CancellationToken cancellationToken)
    {
        _db.StaffAccountAudits.Add(new StaffAccountAudit
        {
            Action = action,
            TargetUserId = targetUserId,
            PerformedByUserId = actorUserId,
            RoleAssigned = string.IsNullOrWhiteSpace(role) ? "Unassigned" : role,
            AtUtc = DateTime.UtcNow
        });
        var target = await _userManager.FindByIdAsync(targetUserId);
        var targetLabel = string.IsNullOrWhiteSpace(target?.FullName)
            ? (target?.UserName ?? targetUserId)
            : target.FullName.Trim();
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Account,
            $"Account.{action}",
            "StaffAccount",
            targetUserId,
            targetLabel,
            summary: string.IsNullOrWhiteSpace(role) ? action : $"{action} · {role}",
            actorUserId: actorUserId);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Dictionary<string, DateTime?>> GetDisabledStateMapAsync(
        IReadOnlyCollection<string> userIds,
        CancellationToken cancellationToken)
    {
        if (userIds.Count == 0)
            return new Dictionary<string, DateTime?>(StringComparer.Ordinal);

        var logs = await _db.StaffAccountAudits
            .Where(a =>
                userIds.Contains(a.TargetUserId)
                && (a.Action == "Disabled" || a.Action == "Enabled"))
            .OrderByDescending(a => a.AtUtc)
            .Select(a => new { a.TargetUserId, a.Action, a.AtUtc })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<string, DateTime?>(StringComparer.Ordinal);
        foreach (var log in logs)
        {
            if (result.ContainsKey(log.TargetUserId))
                continue;
            result[log.TargetUserId] = log.Action == "Disabled"
                ? DateTime.SpecifyKind(log.AtUtc, DateTimeKind.Utc)
                : null;
        }
        return result;
    }

    private static bool IsDisabledByLockout(bool lockoutEnabled, DateTimeOffset? lockoutEnd) =>
        lockoutEnabled && lockoutEnd.HasValue && lockoutEnd.Value.UtcDateTime > DateTime.UtcNow.AddMinutes(1);

    private static string NormalizeStatus(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "active" => "active",
            "disabled" => "disabled",
            _ => "all"
        };

    private sealed class UserListRow
    {
        public string Id { get; init; } = string.Empty;
        public string? FullName { get; init; }
        public string UserName { get; init; } = string.Empty;
        public string Email { get; init; } = string.Empty;
        public string? PhoneNumber { get; init; }
        public DateOnly? BirthDate { get; init; }
        public string? Address { get; init; }
        public string RoleName { get; init; } = "Unassigned";
        public bool LockoutEnabled { get; init; }
        public DateTimeOffset? LockoutEnd { get; init; }
    }
}
