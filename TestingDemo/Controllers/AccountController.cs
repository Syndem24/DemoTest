using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
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
    private readonly IStaffPasswordResetCodeService _passwordResetCode;
    private readonly HotelBookingDbContext _db;
    private readonly ILogger<AccountController> _logger;
    private readonly ISystemAuditRecorder _audit;
    private readonly ISystemAuditQuery _auditQuery;
    private readonly IGoogleAuthSettings _googleAuth;

    public AccountController(
        SignInManager<ApplicationUser> signInManager,
        UserManager<ApplicationUser> userManager,
        IStaffEmailSender emailSender,
        IStaffPasswordResetCodeService passwordResetCode,
        HotelBookingDbContext db,
        ILogger<AccountController> logger,
        ISystemAuditRecorder audit,
        ISystemAuditQuery auditQuery,
        IGoogleAuthSettings googleAuth)
    {
        _signInManager = signInManager;
        _userManager = userManager;
        _emailSender = emailSender;
        _passwordResetCode = passwordResetCode;
        _db = db;
        _logger = logger;
        _audit = audit;
        _auditQuery = auditQuery;
        _googleAuth = googleAuth;
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

            return await RedirectAfterSignInAsync(current, returnUrl);
        }

        ViewBag.GoogleLoginEnabled = await _googleAuth.IsLoginButtonVisibleAsync();
        return View(new LoginViewModel { ReturnUrl = returnUrl });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Login(LoginViewModel model)
    {
        model.ReturnUrl ??= Url.Content("~/Dashboard");
        ViewBag.GoogleLoginEnabled = await _googleAuth.IsLoginButtonVisibleAsync();

        if (!ModelState.IsValid)
            return View(model);

        var user = await FindUserAsync(model.UserNameOrEmail);
        if (user is null)
        {
            ModelState.AddModelError(string.Empty, "Invalid login attempt.");
            return View(model);
        }

        if (await IsGuestUserAsync(user))
        {
            ModelState.AddModelError(string.Empty, "Guest accounts sign in with Google. Use Continue with Google.");
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

            return await RedirectAfterSignInAsync(user, model.ReturnUrl);
        }

        if (result.IsLockedOut)
        {
            ModelState.AddModelError(string.Empty, "Account locked. Try again later.");
            return View(model);
        }

        ModelState.AddModelError(string.Empty, "Invalid login attempt.");
        return View(model);
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ExternalLogin(string? returnUrl = null, bool rememberMe = false)
    {
        if (!await _googleAuth.IsLoginButtonVisibleAsync()
            || !await _googleAuth.TryApplyToOptionsAsync())
        {
            return RedirectToAction(nameof(Login), new { returnUrl });
        }

        var redirectUrl = Url.Action(nameof(ExternalLoginCallback), "Account", new { returnUrl, rememberMe });
        var properties = _signInManager.ConfigureExternalAuthenticationProperties(
            GoogleDefaults.AuthenticationScheme,
            redirectUrl);
        return Challenge(properties, GoogleDefaults.AuthenticationScheme);
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> ExternalLoginCallback(string? returnUrl = null, bool rememberMe = false)
    {
        ViewBag.GoogleLoginEnabled = await _googleAuth.IsLoginButtonVisibleAsync();

        var info = await _signInManager.GetExternalLoginInfoAsync();
        if (info is null)
        {
            TempData["Error"] = "Google sign-in was cancelled or failed. Try again.";
            return RedirectToAction(nameof(Login), new { returnUrl });
        }

        var email = info.Principal.FindFirstValue(ClaimTypes.Email)
                    ?? info.Principal.FindFirstValue("email");
        var emailVerified = info.Principal.FindFirstValue("email_verified");
        var googleSubject = info.ProviderKey;

        if (string.IsNullOrWhiteSpace(email)
            || string.IsNullOrWhiteSpace(googleSubject)
            || string.Equals(emailVerified, "false", StringComparison.OrdinalIgnoreCase))
        {
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            TempData["Error"] = "Google did not provide a verified email. Use another Google account.";
            return RedirectToAction(nameof(Login), new { returnUrl });
        }

        email = email.Trim();
        var normalizedGoogle = _userManager.NormalizeEmail(email);
        var loginInfo = new UserLoginInfo(info.LoginProvider, info.ProviderKey, info.ProviderDisplayName ?? "Google");

        var staffByRecovery = await _db.Users
            .FirstOrDefaultAsync(u =>
                u.NormalizedGoogleEmail == normalizedGoogle
                && u.GoogleVerificationStatus == GoogleVerificationStatus.GoogleVerified);

        if (staffByRecovery is not null)
        {
            var staffSignIn = await TrySignInStaffWithGoogleAsync(
                staffByRecovery, loginInfo, email, rememberMe, returnUrl);
            if (staffSignIn is not null)
                return staffSignIn;
        }

        var existingByLogin = await _userManager.FindByLoginAsync(info.LoginProvider, info.ProviderKey);
        if (existingByLogin is not null)
        {
            var staffSignIn = await TrySignInStaffWithGoogleAsync(
                existingByLogin, loginInfo, email, rememberMe, returnUrl);
            if (staffSignIn is not null)
                return staffSignIn;

            await _signInManager.SignInAsync(existingByLogin, rememberMe);
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            _logger.LogInformation("Guest {User} signed in with Google.", existingByLogin.UserName);
            return await RedirectAfterSignInAsync(existingByLogin, returnUrl);
        }

        var existingByEmail = await _userManager.FindByEmailAsync(email);
        if (existingByEmail is not null)
        {
            var staffSignIn = await TrySignInStaffWithGoogleAsync(
                existingByEmail, loginInfo, email, rememberMe, returnUrl);
            if (staffSignIn is not null)
                return staffSignIn;

            var linkExisting = await _userManager.AddLoginAsync(existingByEmail, info);
            if (!linkExisting.Succeeded && !AlreadyLinked(linkExisting))
            {
                await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
                TempData["Error"] = "Could not link Google to this guest account. Try again or contact the front desk.";
                return RedirectToAction(nameof(Login), new { returnUrl });
            }

            await _signInManager.SignInAsync(existingByEmail, rememberMe);
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            return await RedirectAfterSignInAsync(existingByEmail, returnUrl);
        }

        // New guest: require privacy/integrity agreement before creating the account.
        var given = info.Principal.FindFirstValue(ClaimTypes.GivenName)
                    ?? info.Principal.FindFirstValue(ClaimTypes.Name);
        await HttpContext.Session.LoadAsync();
        GoogleGuestPendingSession.Set(
            HttpContext.Session,
            email,
            info.LoginProvider,
            info.ProviderKey,
            given,
            returnUrl,
            rememberMe);
        return RedirectToAction(nameof(ConfirmGuestAgreement));
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmGuestAgreement()
    {
        await HttpContext.Session.LoadAsync();
        if (!GoogleGuestPendingSession.TryGet(
                HttpContext.Session,
                out var email,
                out _,
                out _,
                out var displayName,
                out var returnUrl,
                out var rememberMe))
        {
            TempData["Error"] = "Guest agreement expired. Sign in with Google again.";
            return RedirectToAction(nameof(Login));
        }

        ViewData["GuestAuthPage"] = true;
        return View(new ConfirmGuestAgreementViewModel
        {
            Email = email,
            DisplayName = displayName,
            ReturnUrl = returnUrl,
            RememberMe = rememberMe
        });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ConfirmGuestAgreement(ConfirmGuestAgreementViewModel model)
    {
        await HttpContext.Session.LoadAsync();
        if (!GoogleGuestPendingSession.TryGet(
                HttpContext.Session,
                out var email,
                out var loginProvider,
                out var providerKey,
                out var displayName,
                out var pendingReturnUrl,
                out var rememberMe))
        {
            TempData["Error"] = "Guest agreement expired. Sign in with Google again.";
            return RedirectToAction(nameof(Login));
        }

        if (!model.AcceptedTerms)
        {
            ModelState.AddModelError(
                nameof(model.AcceptedTerms),
                "Please agree to the guest terms, privacy, and integrity commitments to continue.");
            model.Email = email;
            model.DisplayName = displayName;
            model.ReturnUrl = pendingReturnUrl;
            model.RememberMe = rememberMe;
            ViewData["GuestAuthPage"] = true;
            return View(model);
        }

        var info = await _signInManager.GetExternalLoginInfoAsync();
        UserLoginInfo loginInfo;
        string? givenName = displayName;
        if (info is not null
            && string.Equals(info.LoginProvider, loginProvider, StringComparison.Ordinal)
            && string.Equals(info.ProviderKey, providerKey, StringComparison.Ordinal))
        {
            loginInfo = info;
            givenName = info.Principal.FindFirstValue(ClaimTypes.GivenName)
                       ?? info.Principal.FindFirstValue(ClaimTypes.Name)
                       ?? displayName;
        }
        else
        {
            loginInfo = new UserLoginInfo(loginProvider, providerKey, "Google");
        }

        // Guard: account may have been created in another tab.
        var existing = await _userManager.FindByLoginAsync(loginInfo.LoginProvider, loginInfo.ProviderKey)
                       ?? await _userManager.FindByEmailAsync(email);
        if (existing is not null)
        {
            GoogleGuestPendingSession.Clear(HttpContext.Session);
            var staffSignIn = await TrySignInStaffWithGoogleAsync(
                existing, loginInfo, email, rememberMe, pendingReturnUrl ?? model.ReturnUrl);
            if (staffSignIn is not null)
                return staffSignIn;

            if (await _userManager.FindByLoginAsync(loginInfo.LoginProvider, loginInfo.ProviderKey) is null)
                await _userManager.AddLoginAsync(existing, loginInfo);

            await _signInManager.SignInAsync(existing, rememberMe);
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            return await RedirectAfterSignInAsync(existing, pendingReturnUrl ?? model.ReturnUrl);
        }

        var guest = await CreateGuestFromGoogleAsync(email, loginInfo, givenName);
        GoogleGuestPendingSession.Clear(HttpContext.Session);
        if (guest is null)
        {
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            TempData["Error"] = "Could not create a guest account from Google. Try again.";
            return RedirectToAction(nameof(Login));
        }

        await _signInManager.SignInAsync(guest, rememberMe);
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        _logger.LogInformation("Created guest {User} via Google after agreement.", guest.UserName);
        return await RedirectAfterSignInAsync(guest, pendingReturnUrl ?? model.ReturnUrl);
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeclineGuestAgreement()
    {
        await HttpContext.Session.LoadAsync();
        GoogleGuestPendingSession.Clear(HttpContext.Session);
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        TempData["Error"] = "You must accept the guest agreement to create an account.";
        return RedirectToAction(nameof(Login));
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> ConfirmStaffIdentity()
    {
        await HttpContext.Session.LoadAsync();
        if (!GoogleStaffConfirmSession.TryGet(
                HttpContext.Session,
                out var userId,
                out _,
                out var googleEmail,
                out var returnUrl))
        {
            TempData["Error"] = "Staff confirmation expired. Sign in with Google again.";
            return RedirectToAction(nameof(Login));
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null || !await IsStaffUserAsync(user))
        {
            GoogleStaffConfirmSession.Clear(HttpContext.Session);
            TempData["Error"] = "Staff account was not found. Sign in again.";
            return RedirectToAction(nameof(Login));
        }

        var roles = await _userManager.GetRolesAsync(user);
        return View(new ConfirmStaffIdentityViewModel
        {
            DisplayName = StaffDisplayName.FromUser(user),
            RoleName = roles.FirstOrDefault() ?? "Staff",
            GoogleEmail = googleEmail,
            ReturnUrl = returnUrl
        });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ConfirmStaffIdentity(string? returnUrl, bool confirm)
    {
        await HttpContext.Session.LoadAsync();
        if (!GoogleStaffConfirmSession.TryGet(
                HttpContext.Session,
                out var userId,
                out var googleSubject,
                out var googleEmail,
                out var pendingReturnUrl))
        {
            TempData["Error"] = "Staff confirmation expired. Sign in with Google again.";
            return RedirectToAction(nameof(Login));
        }

        returnUrl ??= pendingReturnUrl;

        if (!confirm)
        {
            GoogleStaffConfirmSession.Clear(HttpContext.Session);
            return RedirectToAction(nameof(Login), new { returnUrl });
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null
            || !await IsStaffUserAsync(user)
            || !ApplicationUser.HasVerifiedGoogleRecovery(user)
            || !string.Equals(user.GoogleEmail, googleEmail, StringComparison.OrdinalIgnoreCase))
        {
            GoogleStaffConfirmSession.Clear(HttpContext.Session);
            TempData["Error"] = "Could not confirm staff identity.";
            return RedirectToAction(nameof(Login));
        }

        var loginInfo = new UserLoginInfo(GoogleDefaults.AuthenticationScheme, googleSubject, "Google");
        var existingLogin = await _userManager.FindByLoginAsync(loginInfo.LoginProvider, loginInfo.ProviderKey);
        if (existingLogin is null)
        {
            var link = await _userManager.AddLoginAsync(user, loginInfo);
            if (!link.Succeeded && !AlreadyLinked(link))
            {
                GoogleStaffConfirmSession.Clear(HttpContext.Session);
                TempData["Error"] = "This Google account is already linked to another login.";
                return RedirectToAction(nameof(Login));
            }
        }
        else if (!string.Equals(existingLogin.Id, user.Id, StringComparison.Ordinal))
        {
            GoogleStaffConfirmSession.Clear(HttpContext.Session);
            TempData["Error"] = "This Google account is already linked to another login.";
            return RedirectToAction(nameof(Login));
        }

        GoogleStaffConfirmSession.Clear(HttpContext.Session);
        await _signInManager.SignInAsync(user, isPersistent: false);
        await RecordAccountActivityAsync(user.Id, "Auth.GoogleStaffConfirm", "Signed in with Google recovery email");
        _logger.LogInformation("Staff {User} confirmed Google identity.", user.UserName);

        if (user.MustChangePassword)
            return RedirectToAction(nameof(ChangePassword));

        return await RedirectAfterSignInAsync(user, returnUrl);
    }

    [HttpGet]
    [Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
    public async Task<IActionResult> Settings(string? section = null, int activityPage = 1)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        var activeSection = string.IsNullOrWhiteSpace(section) ? "overview" : section;
        return View(await BuildSettingsModelAsync(user, activeSection: activeSection, activityPage: activityPage));
    }

    [HttpPost]
    [Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
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
    [Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
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
    [Authorize(Roles = AppRoles.AdminManager + "," + AppRoles.Receptionist)]
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
        TempData["PasswordSuccess"] = "1";
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
        TempData["PromptStartShift"] = "1";
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

        var normalizedEmail = model.Email.Trim();

        if (!await _emailSender.IsConfiguredAsync(cancellationToken))
        {
            _logger.LogWarning("Password reset skipped: SMTP is not configured.");
        }
        else
        {
            var user = await _userManager.FindByEmailAsync(normalizedEmail);
            if (user is not null)
                await _passwordResetCode.IssueAndSendAsync(user, cancellationToken);
        }

        TempData["PasswordResetEmail"] = normalizedEmail;
        return RedirectToAction(nameof(VerifyResetOtp));
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyResetOtp(CancellationToken cancellationToken)
    {
        var email = TempData["PasswordResetEmail"] as string ?? string.Empty;
        var model = new VerifyResetOtpViewModel { Email = email };
        if (!string.IsNullOrWhiteSpace(email))
            model.RemainingAttempts = await _passwordResetCode.GetRemainingAttemptsAsync(email, cancellationToken);

        return View(model);
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    [EnableRateLimiting("staff-password-reset-verify")]
    public async Task<IActionResult> VerifyResetOtp(VerifyResetOtpViewModel model, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            model.RemainingAttempts = await _passwordResetCode.GetRemainingAttemptsAsync(model.Email, cancellationToken);
            return View(model);
        }

        var result = await _passwordResetCode.VerifyAsync(model.Email, model.Otp, cancellationToken);
        model.RemainingAttempts = result.RemainingAttempts
            ?? await _passwordResetCode.GetRemainingAttemptsAsync(model.Email, cancellationToken);

        switch (result.Status)
        {
            case StaffPasswordResetCodeVerifyStatus.Success when result.User is not null:
                var token = await _userManager.GeneratePasswordResetTokenAsync(result.User);
                var encoded = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));
                PasswordResetSession.SetGrant(HttpContext.Session, model.Email.Trim(), encoded);
                return RedirectToAction(nameof(ResetPassword));
            case StaffPasswordResetCodeVerifyStatus.Expired:
                ModelState.AddModelError(string.Empty, "That code has expired. Request a new one.");
                break;
            case StaffPasswordResetCodeVerifyStatus.TooManyAttempts:
                ModelState.AddModelError(string.Empty, "Too many incorrect attempts. This code has expired — request a new one.");
                model.RemainingAttempts = 0;
                break;
            case StaffPasswordResetCodeVerifyStatus.NotFound:
                ModelState.AddModelError(string.Empty, "No active reset code for that email. Check the address or request a new code.");
                break;
            default:
                ModelState.AddModelError(string.Empty, "Incorrect code. Check the digits and try again.");
                break;
        }

        return View(model);
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ForgotPasswordConfirmation()
    {
        return RedirectToAction(nameof(VerifyResetOtp));
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult ResetPassword()
    {
        if (!PasswordResetSession.TryGetGrant(HttpContext.Session, out var email, out _))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        return View(new ResetPasswordViewModel { Email = email });
    }

    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> ResetPassword(ResetPasswordViewModel model)
    {
        if (!PasswordResetSession.TryGetGrant(HttpContext.Session, out var sessionEmail, out var encodedCode))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        if (!string.Equals(sessionEmail, model.Email.Trim(), StringComparison.OrdinalIgnoreCase))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        if (!ModelState.IsValid)
            return View(model);

        var user = await _userManager.FindByEmailAsync(model.Email);
        if (user is null || !TryDecodeResetCode(encodedCode, out var decoded))
            return RedirectToAction(nameof(ResetPasswordInvalid));

        var result = await _userManager.ResetPasswordAsync(user, decoded, model.NewPassword);
        if (!result.Succeeded)
        {
            if (result.Errors.Any(e => e.Code.Contains("Token", StringComparison.OrdinalIgnoreCase)))
                return RedirectToAction(nameof(ResetPasswordInvalid));

            AddPasswordChangeErrors(result.Errors);
            return View(model);
        }

        PasswordResetSession.Clear(HttpContext.Session);
        user.MustChangePassword = false;
        await _userManager.UpdateAsync(user);
        await _userManager.UpdateSecurityStampAsync(user);
        await RecordAccountActivityAsync(user.Id, "Password.Reset", "Reset after email OTP");
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
        var user = await _userManager.GetUserAsync(User);
        var wasGuest = user is not null && await IsGuestUserAsync(user);
        await _signInManager.SignOutAsync();
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        if (wasGuest)
            return RedirectToAction("Index", "Booking");
        return RedirectToAction(nameof(Login));
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

    private async Task<ApplicationUser?> FindUserAsync(string userNameOrEmail)
    {
        var byName = await _userManager.FindByNameAsync(userNameOrEmail);
        if (byName is not null)
            return byName;

        return await _userManager.FindByEmailAsync(userNameOrEmail);
    }

    private async Task<IActionResult?> TrySignInStaffWithGoogleAsync(
        ApplicationUser user,
        UserLoginInfo loginInfo,
        string googleEmail,
        bool rememberMe,
        string? returnUrl)
    {
        if (!await IsStaffUserAsync(user))
            return null;

        var existingLogin = await _userManager.FindByLoginAsync(loginInfo.LoginProvider, loginInfo.ProviderKey);
        if (existingLogin is null)
        {
            var link = await _userManager.AddLoginAsync(user, loginInfo);
            if (!link.Succeeded && !AlreadyLinked(link))
            {
                await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
                TempData["Error"] = "This Google account is already linked to another login.";
                return RedirectToAction(nameof(Login), new { returnUrl });
            }
        }
        else if (!string.Equals(existingLogin.Id, user.Id, StringComparison.Ordinal))
        {
            await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
            TempData["Error"] = "This Google account is already linked to another login.";
            return RedirectToAction(nameof(Login), new { returnUrl });
        }

        var normalizedGoogle = _userManager.NormalizeEmail(googleEmail);
        var emailMatchesAccount = string.Equals(user.NormalizedEmail, normalizedGoogle, StringComparison.Ordinal);
        var emailMatchesRecovery = string.Equals(user.NormalizedGoogleEmail, normalizedGoogle, StringComparison.Ordinal);
        if (emailMatchesAccount || emailMatchesRecovery)
        {
            if (!ApplicationUser.HasVerifiedGoogleRecovery(user)
                || !string.Equals(user.GoogleEmail, googleEmail, StringComparison.OrdinalIgnoreCase))
            {
                user.GoogleEmail = googleEmail;
                user.NormalizedGoogleEmail = normalizedGoogle;
                user.GoogleVerificationStatus = GoogleVerificationStatus.GoogleVerified;
                await _userManager.UpdateAsync(user);
            }
        }

        await _signInManager.SignInAsync(user, rememberMe);
        await HttpContext.SignOutAsync(IdentityConstants.ExternalScheme);
        await RecordAccountActivityAsync(user.Id, "Auth.GoogleStaffSignIn", "Signed in with Google");
        _logger.LogInformation("Staff {User} signed in with Google.", user.UserName);

        if (user.MustChangePassword)
            return RedirectToAction(nameof(ChangePassword));

        return await RedirectAfterSignInAsync(user, returnUrl);
    }

    private async Task<bool> IsStaffUserAsync(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        return roles.Any(r => AppRoles.StaffAssignable.Contains(r));
    }

    private async Task<bool> IsGuestUserAsync(ApplicationUser user)
    {
        var roles = await _userManager.GetRolesAsync(user);
        return roles.Contains(AppRoles.Guest);
    }

    private async Task<IActionResult> RedirectAfterSignInAsync(ApplicationUser? user, string? returnUrl)
    {
        if (user is null || !await IsStaffUserAsync(user))
        {
            if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl) && IsGuestSafeReturnUrl(returnUrl))
                return Redirect(returnUrl);
            return RedirectToAction("Index", "Booking");
        }

        TempData["PromptStartShift"] = "1";
        return RedirectToLocal(returnUrl);
    }

    private static bool IsGuestSafeReturnUrl(string returnUrl)
    {
        if (returnUrl.StartsWith("/Dashboard", StringComparison.OrdinalIgnoreCase)
            || returnUrl.StartsWith("/Rooms", StringComparison.OrdinalIgnoreCase)
            || returnUrl.StartsWith("/Admin", StringComparison.OrdinalIgnoreCase)
            || returnUrl.StartsWith("/WalkIn", StringComparison.OrdinalIgnoreCase)
            || returnUrl.StartsWith("/Account/Settings", StringComparison.OrdinalIgnoreCase))
            return false;
        return true;
    }

    private async Task<ApplicationUser?> CreateGuestFromGoogleAsync(
        string email,
        UserLoginInfo loginInfo,
        string? displayName)
    {
        var local = email.Split('@')[0];
        var sanitized = new string(local.Where(ch => char.IsLetterOrDigit(ch) || ch is '.' or '_' or '-').ToArray());
        if (string.IsNullOrWhiteSpace(sanitized))
            sanitized = "guest";
        if (sanitized.Length > 40)
            sanitized = sanitized[..40];

        var userName = $"guest.{sanitized}";
        var suffix = 0;
        while (await _userManager.FindByNameAsync(userName) is not null)
        {
            suffix++;
            userName = $"guest.{sanitized}.{suffix}";
        }

        var user = new ApplicationUser
        {
            UserName = userName,
            Email = email,
            EmailConfirmed = true,
            FullName = string.IsNullOrWhiteSpace(displayName) ? null : displayName.Trim(),
            MustChangePassword = false,
            GoogleVerificationStatus = GoogleVerificationStatus.NotLinked
        };

        var create = await _userManager.CreateAsync(user);
        if (!create.Succeeded)
        {
            _logger.LogWarning(
                "Guest create failed for {Email}: {Errors}",
                email,
                string.Join("; ", create.Errors.Select(e => e.Description)));
            return null;
        }

        await _userManager.AddToRoleAsync(user, AppRoles.Guest);
        var link = await _userManager.AddLoginAsync(user, loginInfo);
        if (!link.Succeeded && !AlreadyLinked(link))
        {
            _logger.LogWarning(
                "Guest Google link failed for {User}: {Errors}",
                user.UserName,
                string.Join("; ", link.Errors.Select(e => e.Description)));
            await _userManager.DeleteAsync(user);
            return null;
        }

        await _userManager.UpdateAsync(user);
        return user;
    }

    private static bool AlreadyLinked(IdentityResult result) =>
        result.Errors.Any(e =>
            e.Code.Contains("LoginAlreadyAssociated", StringComparison.OrdinalIgnoreCase)
            || e.Description.Contains("already", StringComparison.OrdinalIgnoreCase));

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

        var target = await _userManager.FindByIdAsync(userId);
        var targetLabel = string.IsNullOrWhiteSpace(target?.FullName)
            ? (target?.UserName ?? userId)
            : target.FullName.Trim();
        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Account,
            StaffAccountActivityMapper.ToAccountAction(action),
            StaffAuthSchema.AuditTargetType,
            userId,
            targetLabel,
            summary: clipped,
            actorUserId: userId);
        await _db.SaveChangesAsync();
    }

    private async Task<(IReadOnlyList<AccountActivityItem> Items, int Total)> LoadAccountActivityAsync(
        string userId,
        int page)
    {
        const int pageSize = 15;
        var (rows, total) = await _auditQuery.GetStaffAccountActivityAsync(userId, page, pageSize);
        return (rows.Select(StaffAccountActivityMapper.MapActivity).ToList(), total);
    }
}
