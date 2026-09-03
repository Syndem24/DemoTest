using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[Authorize(Policy = "AdminManagerOnly")]
public class AdminUsersController : Controller
{
    private const string CreatedMessage = "Staff user created successfully.";

    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IStaffAccountCreateService _createService;
    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;
    private readonly ISystemAuditQuery _auditQuery;

    public AdminUsersController(
        UserManager<ApplicationUser> userManager,
        IStaffAccountCreateService createService,
        HotelBookingDbContext db,
        ISystemAuditRecorder audit,
        ISystemAuditQuery auditQuery)
    {
        _userManager = userManager;
        _createService = createService;
        _db = db;
        _audit = audit;
        _auditQuery = auditQuery;
    }

    [HttpGet]
    public async Task<IActionResult> Index(
        string? q,
        string sortBy = "name",
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var model = await BuildIndexModelAsync(q, sortBy, page, cancellationToken);
        return View(model);
    }

    [HttpGet]
    public async Task<IActionResult> Results(
        string? q,
        string sortBy = "name",
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var model = await BuildIndexModelAsync(q, sortBy, page, cancellationToken);
        return PartialView("_AdminUsersResults", model);
    }

    [HttpGet]
    public async Task<IActionResult> Suggestions(string? q, CancellationToken cancellationToken)
    {
        q = (q ?? string.Empty).Trim();
        if (q.Length < 1)
            return Json(Array.Empty<object>());

        var term = $"%{q}%";
        var suggestions = await _db.Users
            .AsNoTracking()
            .Where(u =>
                EF.Functions.Like(u.UserName ?? string.Empty, term)
                || EF.Functions.Like(u.Email ?? string.Empty, term)
                || EF.Functions.Like(u.FullName ?? string.Empty, term))
            .OrderBy(u => u.FullName ?? u.UserName)
            .Select(u => new
            {
                value = u.UserName ?? string.Empty,
                label = string.IsNullOrWhiteSpace(u.FullName)
                    ? $"{u.UserName} ({u.Email})"
                    : $"{u.FullName} ({u.UserName})"
            })
            .Take(8)
            .ToListAsync(cancellationToken);

        return Json(suggestions);
    }

    [HttpGet]
    public async Task<IActionResult> Edit(string id, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(id);
        if (user is null)
            return NotFound();
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? AppRoles.Receptionist;
        var isGuest = string.Equals(role, AppRoles.Guest, StringComparison.Ordinal);
        var model = new EditAdminUserViewModel
        {
            Id = user.Id,
            FullName = user.FullName,
            UserName = user.UserName ?? string.Empty,
            Email = user.Email ?? string.Empty,
            PhoneNumber = user.PhoneNumber,
            BirthDate = user.BirthDate,
            Address = user.Address,
            Role = role,
            IsDisabled = IsDisabledByLockout(user)
        };
        ViewBag.IsGuestAccount = isGuest;
        ViewBag.RoleOptions = isGuest
            ? new[] { AppRoles.Guest }
            : AppRoles.StaffAssignable.ToArray();
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(EditAdminUserViewModel model, CancellationToken cancellationToken)
    {
        var targetProbe = await _userManager.FindByIdAsync(model.Id);
        if (targetProbe is null)
            return NotFound();
        var existingRoles = await _userManager.GetRolesAsync(targetProbe);
        var isGuest = existingRoles.Contains(AppRoles.Guest);
        if (isGuest)
        {
            model.Role = AppRoles.Guest;
            ModelState.Remove(nameof(model.Role));
        }
        else if (!AppRoles.StaffAssignable.Contains(model.Role))
        {
            ModelState.AddModelError(nameof(model.Role), "Invalid role.");
        }

        if (!ModelState.IsValid)
        {
            ViewBag.IsGuestAccount = isGuest;
            ViewBag.RoleOptions = isGuest
                ? new[] { AppRoles.Guest }
                : AppRoles.StaffAssignable.ToArray();
            return View(model);
        }

        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Challenge();
        var target = targetProbe;
        var currentRoles = existingRoles;
        var currentRole = currentRoles.FirstOrDefault() ?? "Unassigned";
        var normalizedUserName = model.UserName.Trim();
        var normalizedEmail = model.Email.Trim();
        var normalizedPhone = string.IsNullOrWhiteSpace(model.PhoneNumber)
            ? null
            : model.PhoneNumber.Trim();
        var normalizedFullName = string.IsNullOrWhiteSpace(model.FullName)
            ? null
            : model.FullName.Trim();
        var normalizedAddress = string.IsNullOrWhiteSpace(model.Address)
            ? null
            : model.Address.Trim();

        void SetRoleOptions()
        {
            ViewBag.IsGuestAccount = isGuest;
            ViewBag.RoleOptions = isGuest
                ? new[] { AppRoles.Guest }
                : AppRoles.StaffAssignable.ToArray();
        }

        if (!string.Equals(target.UserName, normalizedUserName, StringComparison.OrdinalIgnoreCase))
        {
            var setUserName = await _userManager.SetUserNameAsync(target, normalizedUserName);
            if (!setUserName.Succeeded)
            {
                AddIdentityErrors(setUserName);
                SetRoleOptions();
                return View(model);
            }
        }

        if (!string.Equals(target.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
        {
            var setEmail = await _userManager.SetEmailAsync(target, normalizedEmail);
            if (!setEmail.Succeeded)
            {
                AddIdentityErrors(setEmail);
                SetRoleOptions();
                return View(model);
            }
            target.EmailConfirmed = true;
        }

        target.FullName = normalizedFullName;
        target.PhoneNumber = normalizedPhone;
        target.BirthDate = model.BirthDate;
        target.Address = normalizedAddress;

        if (!isGuest && !string.Equals(currentRole, model.Role, StringComparison.Ordinal))
        {
            var remove = await _userManager.RemoveFromRolesAsync(target, currentRoles);
            if (!remove.Succeeded)
            {
                AddIdentityErrors(remove);
                SetRoleOptions();
                return View(model);
            }

            var add = await _userManager.AddToRoleAsync(target, model.Role);
            if (!add.Succeeded)
            {
                AddIdentityErrors(add);
                SetRoleOptions();
                return View(model);
            }
        }

        var update = await _userManager.UpdateAsync(target);
        if (!update.Succeeded)
        {
            AddIdentityErrors(update);
            SetRoleOptions();
            return View(model);
        }

        await AddAuditAsync(
            "Edited",
            target.Id,
            actor.Id,
            model.Role,
            cancellationToken);
        TempData["Message"] = isGuest ? "Guest account updated." : "User account updated.";
        return RedirectToAction(isGuest ? nameof(Guests) : nameof(Index));
    }

    [HttpGet]
    public IActionResult Guests()
    {
        return View();
    }

    [HttpGet]
    public IActionResult Create()
    {
        return View();
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(CreateStaffUserDto dto, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
            return View(dto);

        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Challenge();

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
        {
            ModelState.AddModelError(nameof(dto.Role), "Invalid role.");
            return View(dto);
        }

        if (result.InvalidBirthDate)
        {
            ModelState.AddModelError(nameof(dto.BirthDate), "Enter a valid birth date (age 16–100).");
            return View(dto);
        }

        if (result.StepUpFailed)
        {
            ModelState.AddModelError(
                nameof(dto.CurrentAdminPassword),
                "Re-authentication required to create an AdminManager.");
            return View(dto);
        }

        if (result.PasswordErrors.Count > 0)
        {
            foreach (var error in result.PasswordErrors)
                ModelState.AddModelError(nameof(dto.TemporaryPassword), error);
            return View(dto);
        }

        if (result.CollisionOrIdentityFailure || result.User is null)
        {
            if (!string.IsNullOrWhiteSpace(result.FailureMessage))
            {
                var key = result.FailureField switch
                {
                    "userName" => nameof(dto.UserName),
                    "loginEmail" => nameof(dto.LoginEmail),
                    _ => string.Empty
                };

                ModelState.AddModelError(key, result.FailureMessage);
                return View(dto);
            }

            TempData["Error"] = "Could not create this staff user. Check the details and try again.";
            return View(dto);
        }

        TempData["Message"] = CreatedMessage;
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Disable(
        string id,
        string? q,
        string sortBy = "name",
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Challenge();
        var target = await _userManager.FindByIdAsync(id);
        if (target is null)
            return NotFound();
        if (target.Id == actor.Id)
        {
            TempData["Error"] = "You cannot disable your own account.";
            return RedirectToList(q, sortBy, page);
        }

        if (!target.LockoutEnabled)
        {
            var enableLockout = await _userManager.SetLockoutEnabledAsync(target, true);
            if (!enableLockout.Succeeded)
            {
                TempData["Error"] = "Failed to disable user.";
                return RedirectToList(q, sortBy, page);
            }
        }

        var disable = await _userManager.SetLockoutEndDateAsync(target, DateTimeOffset.MaxValue);
        if (!disable.Succeeded)
        {
            TempData["Error"] = "Failed to disable user.";
            return RedirectToList(q, sortBy, page);
        }

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        await AddAuditAsync("Disabled", target.Id, actor.Id, role, cancellationToken);
        TempData["Message"] = "User account disabled.";
        return RedirectToList(q, sortBy, page);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Enable(
        string id,
        string? q,
        string sortBy = "name",
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Challenge();
        var target = await _userManager.FindByIdAsync(id);
        if (target is null)
            return NotFound();

        var enable = await _userManager.SetLockoutEndDateAsync(target, null);
        if (!enable.Succeeded)
        {
            TempData["Error"] = "Failed to enable user.";
            return RedirectToList(q, sortBy, page);
        }

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        await AddAuditAsync("Enabled", target.Id, actor.Id, role, cancellationToken);
        TempData["Message"] = "User account enabled.";
        return RedirectToList(q, sortBy, page);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(
        string id,
        string? q,
        string sortBy = "name",
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var actor = await _userManager.GetUserAsync(User);
        if (actor is null)
            return Challenge();
        var target = await _userManager.FindByIdAsync(id);
        if (target is null)
            return NotFound();
        if (target.Id == actor.Id)
        {
            TempData["Error"] = "You cannot delete your own account.";
            return RedirectToList(q, sortBy, page);
        }

        if (!IsDisabledByLockout(target))
        {
            TempData["Error"] = "Disable the account before deletion.";
            return RedirectToList(q, sortBy, page);
        }

        var role = (await _userManager.GetRolesAsync(target)).FirstOrDefault() ?? "Unassigned";
        var delete = await _userManager.DeleteAsync(target);
        if (!delete.Succeeded)
        {
            TempData["Error"] = "Failed to delete user account.";
            return RedirectToList(q, sortBy, page);
        }

        await AddAuditAsync("Deleted", target.Id, actor.Id, role, cancellationToken);
        TempData["Message"] = "User account permanently deleted.";
        return RedirectToList(q, sortBy, page);
    }

    private async Task AddAuditAsync(
        string action,
        string targetUserId,
        string actorUserId,
        string role,
        CancellationToken cancellationToken)
    {
        var target = await _userManager.FindByIdAsync(targetUserId);
        var targetLabel = string.IsNullOrWhiteSpace(target?.FullName)
            ? (target?.UserName ?? targetUserId)
            : target.FullName.Trim();
        var summary = string.IsNullOrWhiteSpace(role) ? action : $"{action} · {role}";
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Account,
            StaffAccountActivityMapper.ToAccountAction(action),
            StaffAuthSchema.AuditTargetType,
            targetUserId,
            targetLabel,
            summary: summary,
            actorUserId: actorUserId);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private async Task<Dictionary<string, DateTime?>> GetDisabledStateMapAsync(
        IReadOnlyCollection<string> userIds,
        CancellationToken cancellationToken)
    {
        return await _auditQuery.GetStaffDisabledStateMapAsync(userIds, cancellationToken);
    }

    private static bool IsDisabledByLockout(AdminUserQueryRow user) =>
        user.LockoutEnabled
        && user.LockoutEnd.HasValue
        && user.LockoutEnd.Value.UtcDateTime > DateTime.UtcNow.AddMinutes(1);

    private static bool IsDisabledByLockout(ApplicationUser user) =>
        user.LockoutEnabled
        && user.LockoutEnd.HasValue
        && user.LockoutEnd.Value.UtcDateTime > DateTime.UtcNow.AddMinutes(1);

    private IActionResult RedirectToList(string? q, string? sortBy, int page)
    {
        return RedirectToAction(nameof(Index), new
        {
            q = (q ?? string.Empty).Trim(),
            sortBy = NormalizeSortBy(sortBy),
            page = Math.Max(1, page)
        });
    }

    private static string NormalizeSortBy(string? value) =>
        value?.Trim().ToLowerInvariant() switch
        {
            "username" => "username",
            "email" => "email",
            "role" => "role",
            "status" => "status",
            "created" => "created",
            _ => "name"
        };

    private static IQueryable<AdminUserQueryRow> ApplySorting(
        IQueryable<AdminUserQueryRow> query,
        string sortBy)
    {
        return sortBy switch
        {
            "username" => query.OrderBy(x => x.UserName),
            "email" => query.OrderBy(x => x.Email),
            "role" => query.OrderBy(x => x.RoleName).ThenBy(x => x.FullName ?? x.UserName),
            "status" => query.OrderBy(x => x.LockoutEnd.HasValue).ThenBy(x => x.FullName ?? x.UserName),
            _ => query.OrderBy(x => x.FullName ?? x.UserName)
        };
    }

    private async Task<AdminUserListViewModel> BuildIndexModelAsync(
        string? q,
        string sortBy,
        int page,
        CancellationToken cancellationToken)
    {
        const int pageSize = 15;
        page = Math.Max(1, page);
        sortBy = NormalizeSortBy(sortBy);
        q = (q ?? string.Empty).Trim();

        IQueryable<AdminUserQueryRow> query = _db.Users
            .AsNoTracking()
            .Select(u => new AdminUserQueryRow
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

        query = ApplySorting(query, sortBy);

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = totalCount == 0
            ? 1
            : (int)Math.Ceiling(totalCount / (double)pageSize);
        page = Math.Min(page, totalPages);

        var rows = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var disabledStates = await GetDisabledStateMapAsync(
            rows.Select(u => u.Id).ToArray(),
            cancellationToken);

        var items = new List<AdminUserListItemViewModel>(rows.Count);
        foreach (var user in rows)
        {
            var disabledAtUtc = disabledStates.TryGetValue(user.Id, out var disabledAt)
                ? disabledAt
                : null;
            var isDisabled = IsDisabledByLockout(user);
            items.Add(new AdminUserListItemViewModel
            {
                Id = user.Id,
                FullName = user.FullName,
                UserName = user.UserName,
                Email = user.Email,
                PhoneNumber = user.PhoneNumber,
                BirthDate = user.BirthDate,
                Address = user.Address,
                Role = user.RoleName,
                IsDisabled = isDisabled,
                DisabledAtUtc = disabledAtUtc,
                CanDeleteNow = isDisabled
            });
        }

        var summary = await query
            .GroupBy(_ => 1)
            .Select(g => new
            {
                Total = g.Count(),
                AdminManagers = g.Count(x => x.RoleName == AppRoles.AdminManager),
                Receptionists = g.Count(x => x.RoleName == AppRoles.Receptionist)
            })
            .FirstOrDefaultAsync(cancellationToken);

        return new AdminUserListViewModel
        {
            Users = items,
            DeleteRetentionDays = 0,
            SearchTerm = q,
            SortBy = sortBy,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = totalPages,
            AdminManagersCount = summary?.AdminManagers ?? 0,
            ReceptionistsCount = summary?.Receptionists ?? 0
        };
    }

    private sealed class AdminUserQueryRow
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

    private void AddIdentityErrors(IdentityResult result)
    {
        foreach (var error in result.Errors)
            ModelState.AddModelError(string.Empty, error.Description);
    }
}
