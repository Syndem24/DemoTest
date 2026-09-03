using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

public class HomeController : Controller
{
    private readonly ILogger<HomeController> _logger;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ISecureConfigStore _vault;
    private readonly IGoogleAuthSettings _googleAuth;
    private readonly IStaffEmailSender _email;
    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;

    public HomeController(
        ILogger<HomeController> logger,
        UserManager<ApplicationUser> userManager,
        ISecureConfigStore vault,
        IGoogleAuthSettings googleAuth,
        IStaffEmailSender email,
        HotelBookingDbContext db,
        ISystemAuditRecorder audit)
    {
        _logger = logger;
        _userManager = userManager;
        _vault = vault;
        _googleAuth = googleAuth;
        _email = email;
        _db = db;
        _audit = audit;
    }

    public IActionResult Index()
    {
        return RedirectToAction("Index", "Booking");
    }

    [HttpGet]
    [Authorize(Policy = "AdminManagerOnly")]
    public async Task<IActionResult> Privacy(CancellationToken cancellationToken)
    {
        return View(await BuildIntegrationModelAsync(cancellationToken));
    }

    [HttpPost]
    [Authorize(Policy = "AdminManagerOnly")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Privacy(IntegrationSettingsViewModel model, CancellationToken cancellationToken)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        if (!ModelState.IsValid)
            return View(await MergeIntegrationDisplayAsync(model, cancellationToken));

        if (!await _userManager.CheckPasswordAsync(user, model.CurrentPassword))
        {
            ModelState.AddModelError(nameof(model.CurrentPassword), "Current password is incorrect for this account.");
            return View(await MergeIntegrationDisplayAsync(model, cancellationToken));
        }

        var changedKeys = new List<string>();

        if (!string.IsNullOrWhiteSpace(model.SenderEmail))
        {
            var nextSender = model.SenderEmail.Trim();
            var currentSender = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
            if (!string.Equals(currentSender, nextSender, StringComparison.OrdinalIgnoreCase))
            {
                await _vault.SetAsync(SecureSettingKeys.EmailSender, nextSender, cancellationToken);
                changedKeys.Add("EmailSender");
            }
        }

        if (model.ClearSmtpPassword)
        {
            await _vault.RemoveAsync(SecureSettingKeys.EmailPassword, cancellationToken);
            changedKeys.Add("EmailPassword");
        }
        else if (!string.IsNullOrWhiteSpace(model.SmtpPassword))
        {
            await _vault.SetAsync(SecureSettingKeys.EmailPassword, model.SmtpPassword, cancellationToken);
            changedKeys.Add("EmailPassword");
        }

        if (!string.IsNullOrWhiteSpace(model.GeminiKeyName))
        {
            await _vault.SetAsync(SecureSettingKeys.GeminiKeyName, model.GeminiKeyName.Trim(), cancellationToken);
            changedKeys.Add("GeminiKeyName");
        }

        if (model.ClearGeminiKey)
        {
            await _vault.RemoveAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
            changedKeys.Add("GeminiApiKey");
        }
        else if (!string.IsNullOrWhiteSpace(model.GeminiApiKey))
        {
            await _vault.SetAsync(SecureSettingKeys.GeminiApiKey, model.GeminiApiKey.Trim(), cancellationToken);
            changedKeys.Add("GeminiApiKey");
        }

        var googleChanged = false;
        var enabledFlag = model.GoogleLoginEnabled ? GoogleAuthSettings.EnabledTrue : "false";
        var currentEnabled = await _vault.GetAsync(SecureSettingKeys.GoogleLoginEnabled, cancellationToken) ?? "false";
        if (!string.Equals(currentEnabled, enabledFlag, StringComparison.OrdinalIgnoreCase))
        {
            await _vault.SetAsync(SecureSettingKeys.GoogleLoginEnabled, enabledFlag, cancellationToken);
            changedKeys.Add("GoogleLoginEnabled");
            googleChanged = true;
        }

        var nextClientId = GoogleAuthSettings.SanitizeClientId(model.GoogleClientId);
        if (nextClientId is not null)
        {
            if (!GoogleAuthSettings.IsUsableClientId(nextClientId))
            {
                ModelState.AddModelError(
                    nameof(model.GoogleClientId),
                    "Client ID must look like …apps.googleusercontent.com (copy it from Google Cloud → Credentials → Web client).");
                return View(await MergeIntegrationDisplayAsync(model, cancellationToken));
            }

            var currentClientId = await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken);
            if (!string.Equals(currentClientId, nextClientId, StringComparison.Ordinal))
            {
                await _vault.SetAsync(SecureSettingKeys.GoogleClientId, nextClientId, cancellationToken);
                changedKeys.Add("GoogleClientId");
                googleChanged = true;
            }
        }

        if (model.ClearGoogleClientSecret)
        {
            await _vault.RemoveAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken);
            changedKeys.Add("GoogleClientSecret");
            googleChanged = true;
        }
        else if (!string.IsNullOrWhiteSpace(model.GoogleClientSecret))
        {
            var nextSecret = GoogleAuthSettings.SanitizeSecret(model.GoogleClientSecret);
            if (string.IsNullOrWhiteSpace(nextSecret))
            {
                ModelState.AddModelError(nameof(model.GoogleClientSecret), "Client Secret looks empty after trimming.");
                return View(await MergeIntegrationDisplayAsync(model, cancellationToken));
            }

            await _vault.SetAsync(SecureSettingKeys.GoogleClientSecret, nextSecret, cancellationToken);
            changedKeys.Add("GoogleClientSecret");
            googleChanged = true;
        }

        if (model.GoogleLoginEnabled)
        {
            var (storedId, storedSecret) = await _googleAuth.GetCredentialsAsync(cancellationToken);
            if (!GoogleAuthSettings.IsUsableClientId(storedId) || !GoogleAuthSettings.IsUsableSecret(storedSecret))
            {
                ModelState.AddModelError(
                    nameof(model.GoogleLoginEnabled),
                    "Turn on Google login only after both Client ID and Client Secret are saved.");
                return View(await MergeIntegrationDisplayAsync(model, cancellationToken));
            }
        }

        if (googleChanged)
            _googleAuth.NotifyOptionsChanged();

        if (changedKeys.Count > 0)
        {
            _audit.Record(
                SystemAuditIntent.ConfigurationChange,
                SystemAuditDomain.Configuration,
                "SecureConfig.Save",
                "SecureSetting",
                string.Join(",", changedKeys),
                "Integration vault",
                summary: $"Integration keys updated: {string.Join(", ", changedKeys)}.");
            await _db.SaveChangesAsync(cancellationToken);
        }

        _logger.LogInformation("Integration secrets updated by {User}. Keys={Keys}", user.UserName, string.Join(",", changedKeys));
        TempData["Message"] = changedKeys.Count == 0
            ? "No secret values were changed."
            : "Integration settings saved.";
        return RedirectToAction(nameof(Privacy));
    }

    [HttpPost]
    [Authorize(Policy = "AdminManagerOnly")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> TestSmtp(IntegrationSettingsViewModel model, CancellationToken cancellationToken)
    {
        var user = await _userManager.GetUserAsync(User);
        if (user is null)
            return Challenge();

        if (string.IsNullOrWhiteSpace(model.CurrentPassword)
            || !await _userManager.CheckPasswordAsync(user, model.CurrentPassword))
        {
            TempData["Error"] = "Enter your current password to send a test email.";
            return RedirectToAction(nameof(Privacy));
        }

        if (string.IsNullOrWhiteSpace(user.Email))
        {
            TempData["Error"] = "Your account has no email address for the test message.";
            return RedirectToAction(nameof(Privacy));
        }

        try
        {
            await _email.SendTestAsync(user.Email, cancellationToken);
            TempData["Message"] = "Test email sent to your staff address.";
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "SMTP test failed for {User}.", user.UserName);
            TempData["Error"] = "Could not send the test email. Check the Gmail sender and app password.";
        }

        return RedirectToAction(nameof(Privacy));
    }

    [Route("Home/NotFoundPage")]
    [Route("NotFound")]
    [Route("404")]
    public IActionResult NotFoundPage()
    {
        Response.StatusCode = 404;
        return View("NotFound");
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }

    private async Task<IntegrationSettingsViewModel> BuildIntegrationModelAsync(CancellationToken cancellationToken)
    {
        return new IntegrationSettingsViewModel
        {
            SenderEmail = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken),
            SmtpPasswordConfigured = await _vault.HasValueAsync(SecureSettingKeys.EmailPassword, cancellationToken),
            GeminiConfigured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken),
            GeminiKeyName = await _vault.GetAsync(SecureSettingKeys.GeminiKeyName, cancellationToken),
            GoogleLoginEnabled = await _googleAuth.IsEnabledAsync(cancellationToken),
            GoogleClientId = await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken),
            GoogleClientSecretConfigured = await _vault.HasValueAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken)
        };
    }

    private async Task<IntegrationSettingsViewModel> MergeIntegrationDisplayAsync(
        IntegrationSettingsViewModel model,
        CancellationToken cancellationToken)
    {
        model.SmtpPassword = null;
        model.GeminiApiKey = null;
        model.GoogleClientSecret = null;
        model.CurrentPassword = string.Empty;
        model.SmtpPasswordConfigured = await _vault.HasValueAsync(SecureSettingKeys.EmailPassword, cancellationToken);
        model.GeminiConfigured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
        model.GoogleClientSecretConfigured = await _vault.HasValueAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken);
        model.SenderEmail ??= await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
        model.GeminiKeyName ??= await _vault.GetAsync(SecureSettingKeys.GeminiKeyName, cancellationToken);
        model.GoogleClientId ??= await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken);
        return model;
    }
}
