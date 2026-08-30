using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

public class AccountController : Controller
{
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IStaffEmailSender _emailSender;
    private readonly IConfiguration _configuration;
    private readonly HotelBookingDbContext _db;
    private readonly ILogger<AccountController> _logger;
    private readonly ISystemAuditRecorder _audit;

    public AccountController(
        SignInManager<ApplicationUser> signInManager,
        UserManager<ApplicationUser> userManager,
        IStaffEmailSender emailSender,
        IConfiguration configuration,
        HotelBookingDbContext db,
        ILogger<AccountController> logger,
        ISystemAuditRecorder audit)
    {
        _signInManager = signInManager;
        _userManager = userManager;
        _emailSender = emailSender;
        _configuration = configuration;
        _db = db;
        _logger = logger;
        _audit = audit;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> Login(string? returnUrl = null)
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            var current = await _userManager.GetUserAsync(User);
            if (current?.MustChangePassword == true)
                return RedirectToAction(nameof(ChangePassword));

            return RedirectToLocal(returnUrl);
        }

        return View(new LoginViewModel { ReturnUrl = returnUrl });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginViewModel model)
    {
        model.ReturnUrl ??= Url.Content("~/Dashboard");

        if (!ModelState.IsValid)
            return View(model);

        var user = await FindUserAsync(model.UserNameOrEmail);
        if (user is null)
        {
            ModelState.AddModelError(string.Empty, "Invalid login attempt.");
            return View(model);
        }

        var result = await _signInManager.PasswordSignInAsync(
            user.UserName!,
            model.Password,
            model.RememberMe,
            lockoutOnFailure: true);

        if (result.Succeeded)
        {
            _logger.LogInformation("User {User} logged in.", user.UserName);
            if (user.MustChangePassword)
                return RedirectToAction(nameof(ChangePassword));

            return RedirectToLocal(model.ReturnUrl);
        }

        if (result.IsLockedOut)
        {
            ModelState.AddModelError(string.Empty, "Account locked. Try again later.");
            return View(model);
        }

        ModelState.AddModelError(string.Empty, "Invalid login attempt.");
        return View(model);
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> Settings(string? section = null, int activityPage = 1)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        var activeSection = string.IsNullOrWhiteSpace(section) ? "overview" : section;
        return View(await BuildSettingsModelAsync(user, activeSection: activeSection, activityPage: activityPage));
    }

    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateProfile([Bind(Prefix = "Profile")] UpdateProfileViewModel model)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        model.CurrentPassword = null;
        model.GoogleEmail = user.GoogleEmail;
        model.Email = user.Email ?? string.Empty;
        ModelState.Remove("Profile.GoogleEmail");
        ModelState.Remove(nameof(UpdateProfileViewModel.GoogleEmail));
        ModelState.Remove("Profile.CurrentPassword");
        ModelState.Remove(nameof(UpdateProfileViewModel.CurrentPassword));
        ModelState.Remove("Profile.Email");
        ModelState.Remove(nameof(UpdateProfileViewModel.Email));

        if (!ModelState.IsValid)
            return View("Settings", await BuildSettingsModelAsync(user, profileModel: model, activeSection: "profile"));

        var userName = model.UserName.Trim();
        var phone = string.IsNullOrWhiteSpace(model.PhoneNumber) ? null : model.PhoneNumber.Trim();
        var fullName = string.IsNullOrWhiteSpace(model.FullName) ? null : model.FullName.Trim();
        var address = string.IsNullOrWhiteSpace(model.Address) ? null : model.Address.Trim();
        var changedFields = new List<string>();
        if (!string.Equals(user.UserName, userName, StringComparison.OrdinalIgnoreCase))
            changedFields.Add("Username");
        if (!string.Equals(user.FullName, fullName, StringComparison.Ordinal))
            changedFields.Add("Full name");
        if (!string.Equals(user.PhoneNumber, phone, StringComparison.Ordinal))
            changedFields.Add("Phone");
        if (!string.Equals(user.Address, address, StringComparison.Ordinal))
            changedFields.Add("Address");
        if (user.BirthDate != model.BirthDate)
            changedFields.Add("Birth date");

        if (!string.Equals(user.UserName, userName, StringComparison.OrdinalIgnoreCase))
        {
            var setUserName = await _userManager.SetUserNameAsync(user, userName);
            if (!setUserName.Succeeded)
            {
                AddIdentityErrors(setUserName, sectionModelPrefix: "Profile");
                return View("Settings", await BuildSettingsModelAsync(user, profileModel: model, activeSection: "profile"));
            }
        }

        user.FullName = fullName;
        user.PhoneNumber = phone;
        user.Address = address;
        user.BirthDate = model.BirthDate;

        var update = await _userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            AddIdentityErrors(update, sectionModelPrefix: "Profile");
            return View("Settings", await BuildSettingsModelAsync(user, profileModel: model, activeSection: "profile"));
        }

        await _signInManager.RefreshSignInAsync(user);
        if (changedFields.Count > 0)
            await RecordAccountActivityAsync(user.Id, "Profile.Update", string.Join(", ", changedFields));

        TempData["Message"] = "Profile details updated successfully.";
        return RedirectToAction(nameof(Settings), new { section = "profile" });
    }

    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdateGoogleRecovery([Bind(Prefix = "Profile")] UpdateGoogleRecoveryViewModel model)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        var postedEmail = string.IsNullOrWhiteSpace(model.GoogleEmail) ? null : model.GoogleEmail.Trim();
        var profileModel = CreateProfileModel(user);
        profileModel.GoogleEmail = postedEmail;

        if (postedEmail is null)
        {
            AddProfileFieldError(
                nameof(UpdateProfileViewModel.GoogleEmail),
                "Recovery email is required.");
        }

        if (!ModelState.IsValid || postedEmail is null)
        {
            var showStepUp = HasFieldError("Profile.CurrentPassword") || HasFieldError("CurrentPassword");
            return View("Settings", await BuildSettingsModelAsync(
                user,
                profileModel: profileModel,
                activeSection: "google",
                showGoogleStepUp: showStepUp));
        }

        var normalizedGoogleEmail = _userManager.NormalizeEmail(postedEmail);
        var googleEmailChanging = !string.Equals(
            user.NormalizedGoogleEmail,
            normalizedGoogleEmail,
            StringComparison.Ordinal)
            || !string.Equals(user.NormalizedEmail, normalizedGoogleEmail, StringComparison.Ordinal);

        if (!googleEmailChanging)
        {
            TempData["Message"] = "Recovery email is unchanged.";
            return RedirectToAction(nameof(Settings), new { section = "google" });
        }

        if (string.IsNullOrEmpty(model.CurrentPassword))
        {
            AddProfileFieldError(
                nameof(UpdateProfileViewModel.CurrentPassword),
                "Enter your current password to continue.");
            return View("Settings", await BuildSettingsModelAsync(
                user,
                profileModel: profileModel,
                activeSection: "google",
                showGoogleStepUp: true));
        }

        if (!await _userManager.CheckPasswordAsync(user, model.CurrentPassword))
        {
            _logger.LogWarning("Recovery email change rejected for {User}: invalid current password.", user.UserName);
            AddProfileFieldError(
                nameof(UpdateProfileViewModel.CurrentPassword),
                "Current password is incorrect for this account.");
            return View("Settings", await BuildSettingsModelAsync(
                user,
                profileModel: profileModel,
                activeSection: "google",
                showGoogleStepUp: true));
        }

        var collision = await _userManager.Users.AnyAsync(
            u => u.Id != user.Id
                 && (u.NormalizedGoogleEmail == normalizedGoogleEmail
                     || u.NormalizedEmail == normalizedGoogleEmail));
        if (collision)
        {
            AddProfileFieldError(
                nameof(UpdateProfileViewModel.GoogleEmail),
                "This email is already used by another staff account.");
            return View("Settings", await BuildSettingsModelAsync(
                user,
                profileModel: profileModel,
                activeSection: "google"));
        }

        if (!string.Equals(user.NormalizedEmail, normalizedGoogleEmail, StringComparison.Ordinal))
        {
            var setEmail = await _userManager.SetEmailAsync(user, postedEmail);
            if (!setEmail.Succeeded)
            {
                AddIdentityErrors(setEmail, sectionModelPrefix: "Profile");
                AddProfileFieldError(
                    nameof(UpdateProfileViewModel.GoogleEmail),
                    "This email could not be saved. It may already be in use.");
                return View("Settings", await BuildSettingsModelAsync(
                    user,
                    profileModel: profileModel,
                    activeSection: "google"));
            }

            user.EmailConfirmed = true;
        }

        user.GoogleEmail = postedEmail;
        user.NormalizedGoogleEmail = normalizedGoogleEmail;
        user.GoogleVerificationStatus = GoogleVerificationStatus.PendingGoogleVerification;

        var update = await _userManager.UpdateAsync(user);
        if (!update.Succeeded)
        {
            AddIdentityErrors(update, sectionModelPrefix: "Profile");
            return View("Settings", await BuildSettingsModelAsync(user, profileModel: profileModel, activeSection: "google"));
        }

        await _signInManager.RefreshSignInAsync(user);
        await RecordAccountActivityAsync(user.Id, "RecoveryEmail.Update", "Login and recovery email");
        _logger.LogInformation("User {User} updated recovery email.", user.UserName);

        TempData["Message"] = "Recovery email saved. Your profile email now matches this address.";
        return RedirectToAction(nameof(Settings), new { section = "google" });
    }

    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> UpdatePassword([Bind(Prefix = "Password")] ChangePasswordViewModel model)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        if (!ModelState.IsValid)
            return View("Settings", await BuildSettingsModelAsync(user, passwordModel: model, activeSection: "password"));

        var change = await _userManager.ChangePasswordAsync(user, model.CurrentPassword, model.NewPassword);
        if (!change.Succeeded)
        {
            AddPasswordChangeErrors(change.Errors, sectionModelPrefix: "Password");
            return View("Settings", await BuildSettingsModelAsync(user, passwordModel: model, activeSection: "password"));
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);
        await _userManager.UpdateSecurityStampAsync(user);
        await _signInManager.RefreshSignInAsync(user);
        await RecordAccountActivityAsync(user.Id, "Password.Update", "Password");

        TempData["Message"] = "Password updated successfully.";
        return RedirectToAction(nameof(Settings), new { section = "password" });
    }

    [HttpGet]
    [Authorize]
    public IActionResult ChangePassword()
    {
        return View(new ChangePasswordViewModel());
    }

    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ChangePassword(ChangePasswordViewModel model)
    {
        if (!ModelState.IsValid)
            return View(model);

        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        if (string.Equals(model.CurrentPassword, model.NewPassword, StringComparison.Ordinal))
        {
            ModelState.AddModelError(
                nameof(model.NewPassword),
                "Choose a new password that is not the temporary password.");
            return View(model);
        }

        var change = await _userManager.ChangePasswordAsync(user, model.CurrentPassword, model.NewPassword);
        if (!change.Succeeded)
        {
            AddPasswordChangeErrors(change.Errors);
            return View(model);
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);
        await _userManager.UpdateSecurityStampAsync(user);
        await _signInManager.RefreshSignInAsync(user);

        await RecordAccountActivityAsync(user.Id, "Password.Update", "Password");
        _logger.LogInformation("User {User} changed password (must-change cleared).", user.UserName);
        TempData["Message"] = "Password updated.";
        return RedirectToAction("Index", "Dashboard");
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ForgotPassword()
    {
        return View(new ForgotPasswordViewModel());
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("staff-password-reset")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordViewModel model, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
            return View(model);

        if (!await _emailSender.IsConfiguredAsync(cancellationToken))
        {
            _logger.LogWarning("Password reset skipped: SMTP is not configured.");
            return RedirectToAction(nameof(ForgotPasswordConfirmation));
        }

        var user = await _userManager.FindByEmailAsync(model.Email.Trim());
        if (user is not null)
            await TrySendPasswordResetAsync(user, cancellationToken);

        return RedirectToAction(nameof(ForgotPasswordConfirmation));
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ForgotPasswordConfirmation()
    {
        return View();
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(string? email = null, string? code = null)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
            return RedirectToAction(nameof(ForgotPassword));

        if (!await IsPasswordResetTokenValidAsync(email, code))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        return View(new ResetPasswordViewModel
        {
            Email = email,
            Code = code
        });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetPassword(ResetPasswordViewModel model)
    {
        if (!await IsPasswordResetTokenValidAsync(model.Email, model.Code))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        if (!ModelState.IsValid)
            return View(model);

        var user = await _userManager.FindByEmailAsync(model.Email);
        if (user is null || !TryDecodeResetCode(model.Code, out var decoded))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        var result = await _userManager.ResetPasswordAsync(user, decoded, model.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code.Contains("Token", StringComparison.OrdinalIgnoreCase)))
                return RedirectToAction(nameof(ResetPasswordInvalid));

            AddPasswordChangeErrors(result.Errors);
            return View(model);
        }

        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);
        await _userManager.UpdateSecurityStampAsync(user);
        await RecordAccountActivityAsync(user.Id, "Password.Reset", "Reset from email link");
        _logger.LogInformation("User {User} reset their password.", user.UserName);
        return RedirectToAction(nameof(ResetPasswordConfirmation));
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ResetPasswordConfirmation()
    {
        return View();
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ResetPasswordInvalid()
    {
        return View();
    }

    [HttpPost]
    [Authorize]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Logout()
    {
        await _signInManager.SignOutAsync();
        return RedirectToAction(nameof(Login));
    }

    private async Task TrySendPasswordResetAsync(ApplicationUser user, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(user.Email))
            return;

        var token = await _userManager.GeneratePasswordResetTokenAsync(user);
        var code = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
        var resetUrl = BuildPublicResetUrl(user.Email, code);

        try
        {
            await _emailSender.SendPasswordResetAsync(user.Email, resetUrl, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Password reset email failed for {User}.", user.UserName);
        }
    }

    private async Task<bool> IsPasswordResetTokenValidAsync(string email, string code)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null || !TryDecodeResetCode(code, out var decoded))
            return false;

        return await _userManager.VerifyUserTokenAsync(
            user,
            _userManager.Options.Tokens.PasswordResetTokenProvider,
            UserManager<ApplicationUser>.ResetPasswordTokenPurpose,
            decoded);
    }

    private static bool TryDecodeResetCode(string code, out string decoded)
    {
        try
        {
            decoded = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(code));
            return !string.IsNullOrWhiteSpace(decoded);
        }
        catch (Exception)
        {
            decoded = string.Empty;
            return false;
        }
    }

    private string BuildPublicResetUrl(string email, string code)
    {
        var publicBase = (_configuration["PublicBaseUrl"] ?? "http://localhost:5288").TrimEnd('/');
        var relative = Url.Action(nameof(ResetPassword), "Account", new { email, code })
                       ?? $"/Account/ResetPassword?email={Uri.EscapeDataString(email)}&code={Uri.EscapeDataString(code)}";
        if (relative.StartsWith("http", StringComparison.OrdinalIgnoreCase))
        {
            var pathAndQuery = new Uri(relative).PathAndQuery;
            return publicBase + pathAndQuery;
        }

        return publicBase + (relative.StartsWith('/') ? relative : "/" + relative);
    }

    private async Task<ApplicationUser?> FindUserAsync(string userNameOrEmail)
    {
        var byName = await _userManager.FindByNameAsync(userNameOrEmail);
        if (byName is not null)
            return byName;

        return await _userManager.FindByEmailAsync(userNameOrEmail);
    }

    private IActionResult RedirectToLocal(string? returnUrl)
    {
        if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl))
            return Redirect(returnUrl);
        return RedirectToAction("Index", "Dashboard");
    }

    private void AddIdentityErrors(IdentityResult result, string? sectionModelPrefix = null)
    {
        foreach (var error in result.Errors)
        {
            var field = error.Code switch
            {
                "DuplicateUserName" or "InvalidUserName" => nameof(UpdateProfileViewModel.UserName),
                "DuplicateEmail" or "InvalidEmail" => nameof(UpdateProfileViewModel.Email),
                _ => null
            };

            if (field is not null && !string.IsNullOrWhiteSpace(sectionModelPrefix))
                ModelState.AddModelError($"{sectionModelPrefix}.{field}", error.Description);
            else
                ModelState.AddModelError(string.Empty, error.Description);
        }
    }

    private void AddPasswordChangeErrors(IEnumerable<IdentityError> errors, string? sectionModelPrefix = null)
    {
        foreach (var error in errors)
        {
            if (string.Equals(error.Code, "PasswordMismatch", StringComparison.OrdinalIgnoreCase))
            {
                AddPasswordFieldError(
                    nameof(ChangePasswordViewModel.CurrentPassword),
                    "Current password is incorrect for this account.",
                    sectionModelPrefix);
                continue;
            }

            if (error.Code.StartsWith("Password", StringComparison.OrdinalIgnoreCase))
            {
                AddPasswordFieldError(nameof(ChangePasswordViewModel.NewPassword), error.Description, sectionModelPrefix);
                continue;
            }

            ModelState.AddModelError(string.Empty, error.Description);
        }
    }

    private void AddPasswordFieldError(string fieldName, string message, string? sectionModelPrefix)
    {
        ModelState.AddModelError(fieldName, message);
        if (!string.IsNullOrWhiteSpace(sectionModelPrefix))
            ModelState.AddModelError($"{sectionModelPrefix}.{fieldName}", message);
    }

    private void AddProfileFieldError(string fieldName, string message)
    {
        ModelState.AddModelError($"Profile.{fieldName}", message);
    }

    private bool HasFieldError(string key)
        => ModelState.TryGetValue(key, out var entry) && entry.Errors.Count > 0;

    private static UpdateProfileViewModel CreateProfileModel(ApplicationUser user)
    {
        return new UpdateProfileViewModel
        {
            FullName = user.FullName,
            UserName = user.UserName ?? string.Empty,
            Email = user.Email ?? string.Empty,
            PhoneNumber = user.PhoneNumber,
            Address = user.Address,
            BirthDate = user.BirthDate,
            GoogleEmail = user.GoogleEmail ?? user.Email
        };
    }

    private async Task<AccountSettingsViewModel> BuildSettingsModelAsync(
        ApplicationUser user,
        UpdateProfileViewModel? profileModel = null,
        ChangePasswordViewModel? passwordModel = null,
        string activeSection = "overview",
        bool showGoogleStepUp = false,
        int activityPage = 1)
    {
        profileModel ??= CreateProfileModel(user);
        profileModel.CurrentPassword = null;
        passwordModel ??= new ChangePasswordViewModel();

        var roles = await _userManager.GetRolesAsync(user);
        var roleName = roles.FirstOrDefault() ?? "Staff";
        var (activity, activityTotal) = await LoadAccountActivityAsync(user.Id, activityPage);

        return new AccountSettingsViewModel
        {
            Profile = profileModel,
            Password = passwordModel,
            ActiveSection = activeSection,
            RoleName = roleName,
            ShowGoogleStepUp = showGoogleStepUp,
            ActivityLog = activity,
            ActivityPage = activityPage < 1 ? 1 : activityPage,
            ActivityPageSize = 15,
            ActivityTotal = activityTotal
        };
    }

    private async Task RecordAccountActivityAsync(string userId, string action, string detail)
    {
        var clipped = string.IsNullOrWhiteSpace(detail) ? "Updated" : detail.Trim();
        if (clipped.Length > 64)
            clipped = clipped[..61] + "...";

        _db.StaffAccountAudits.Add(new StaffAccountAudit
        {
            Action = action,
            TargetUserId = userId,
            PerformedByUserId = userId,
            RoleAssigned = clipped,
            AtUtc = DateTime.UtcNow
        });
        var target = await _userManager.FindByIdAsync(userId);
        var targetLabel = string.IsNullOrWhiteSpace(target?.FullName)
            ? (target?.UserName ?? userId)
            : target.FullName.Trim();
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Account,
            action.StartsWith("Password", StringComparison.Ordinal) ? $"Account.{action}" : $"Account.{action}",
            "StaffAccount",
            userId,
            targetLabel,
            summary: clipped);
        await _db.SaveChangesAsync();
    }

    private async Task<(IReadOnlyList<AccountActivityItem> Items, int Total)> LoadAccountActivityAsync(
        string userId,
        int page)
    {
        const int pageSize = 15;
        page = Math.Max(1, page);

        var query = _db.StaffAccountAudits
            .AsNoTracking()
            .Where(a => a.TargetUserId == userId && AccountActivityActions.Contains(a.Action));

        var total = await query.CountAsync();
        var rows = await query
            .OrderByDescending(a => a.AtUtc)
            .ThenByDescending(a => a.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (rows.Select(MapAccountActivity).ToList(), total);
    }

    private static readonly HashSet<string> AccountActivityActions = new(StringComparer.Ordinal)
    {
        "Created",
        "Edited",
        "Disabled",
        "Enabled",
        "Profile.Update",
        "RecoveryEmail.Update",
        "Password.Update",
        "Password.Reset"
    };

    private static AccountActivityItem MapAccountActivity(StaffAccountAudit row)
    {
        var (title, fallback) = row.Action switch
        {
            "Profile.Update" => ("Profile details updated", "Account details"),
            "RecoveryEmail.Update" => ("Login / recovery email changed", "Email"),
            "Password.Update" => ("Password changed", "Password"),
            "Password.Reset" => ("Password reset from email link", "Password"),
            "Created" => ("Account created", "Staff account"),
            "Edited" => ("Account edited by an administrator", "Account details"),
            "Disabled" => ("Account disabled", "Access"),
            "Enabled" => ("Account enabled", "Access"),
            _ => ("Account updated", "Account")
        };

        var local = PhilippinesTime.ToManila(row.AtUtc);
        return new AccountActivityItem
        {
            Title = title,
            Detail = string.IsNullOrWhiteSpace(row.RoleAssigned) || row.RoleAssigned == "Unassigned"
                ? fallback
                : row.RoleAssigned,
            WhenLocal = local.ToString("dd MMM yyyy, h:mm tt"),
            WhenUtc = DateTime.SpecifyKind(row.AtUtc, DateTimeKind.Utc).ToString("o")
        };
    }
}
