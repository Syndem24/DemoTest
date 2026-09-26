using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.Services.Chat;
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
    private readonly ChatProviderUsageTracker _chatUsage;
    private readonly EmailSendTelemetry _emailTelemetry;
    private readonly IEnumerable<IChatLlmProvider> _chatProviders;

    public HomeController(
        ILogger<HomeController> logger,
        UserManager<ApplicationUser> userManager,
        ISecureConfigStore vault,
        IGoogleAuthSettings googleAuth,
        IStaffEmailSender email,
        HotelBookingDbContext db,
        ISystemAuditRecorder audit,
        ChatProviderUsageTracker chatUsage,
        EmailSendTelemetry emailTelemetry,
        IEnumerable<IChatLlmProvider> providers)
    {
        _logger = logger;
        _userManager = userManager;
        _vault = vault;
        _googleAuth = googleAuth;
        _email = email;
        _db = db;
        _audit = audit;
        _chatUsage = chatUsage;
        _emailTelemetry = emailTelemetry;
        _chatProviders = providers;
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

        if (!string.IsNullOrWhiteSpace(model.GroqKeyName))
        {
            await _vault.SetAsync(SecureSettingKeys.GroqKeyName, model.GroqKeyName.Trim(), cancellationToken);
            changedKeys.Add("GroqKeyName");
        }

        if (model.ClearGroqKey)
        {
            await _vault.RemoveAsync(SecureSettingKeys.GroqApiKey, cancellationToken);
            changedKeys.Add("GroqApiKey");
        }
        else if (!string.IsNullOrWhiteSpace(model.GroqApiKey))
        {
            await _vault.SetAsync(SecureSettingKeys.GroqApiKey, model.GroqApiKey.Trim(), cancellationToken);
            changedKeys.Add("GroqApiKey");
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

    [HttpPost]
    [Authorize(Policy = "AdminManagerOnly")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> CheckProvider([FromQuery] ChatProviderKind kind, CancellationToken cancellationToken)
    {
        if (kind is not (ChatProviderKind.Gemini or ChatProviderKind.Groq))
            return BadRequest(new { message = "Unknown provider." });

        var provider = _chatProviders.FirstOrDefault(p => p.Kind == kind);
        if (provider is null || !await provider.IsConfiguredAsync(cancellationToken))
        {
            return Json(new { ok = false, state = "not_configured", message = "No API key saved." });
        }

        var request = new ChatCompletionRequest
        {
            SystemInstruction = "Reply with the single word OK.",
            HotelContext = string.Empty,
            History = Array.Empty<ChatTurn>(),
            UserMessage = "ping",
            MaxOutputTokens = 128,
            Temperature = 0
        };

        string state;
        object payload;
        try
        {
            using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            linkedCts.CancelAfter(TimeSpan.FromSeconds(20));
            var result = await provider.CompleteAsync(request, linkedCts.Token);
            // 5xx / timeouts are usually a transient provider hiccup — retry once
            // before alarming the admin with a hard failure.
            if (IsTransient(result))
            {
                await Task.Delay(TimeSpan.FromMilliseconds(900), linkedCts.Token);
                result = await provider.CompleteAsync(request, linkedCts.Token);
            }
            if (result.Succeeded && !string.IsNullOrWhiteSpace(result.Text))
            {
                _chatUsage.RecordHealthSuccess(kind);
                state = "ok";
                payload = new { ok = true, state, message = "Responding normally.", checkedAtUtc = DateTime.UtcNow };
            }
            else if (result.QuotaExhausted)
            {
                _chatUsage.RecordFailure(kind, "quota");
                state = "quota";
                payload = new { ok = false, state, message = "Quota exhausted — provider is cooling down." };
            }
            else
            {
                _chatUsage.RecordFailure(kind, result.ErrorKind ?? "error");
                state = "error";
                payload = result.ErrorKind is "http_503" or "http_502" or "http_504" or "timeout"
                    ? new { ok = false, state, message = $"Provider temporarily unavailable ({result.ErrorKind}) — try again shortly." }
                    : new { ok = false, state, message = $"Provider returned an error ({result.ErrorKind ?? "unknown"})." };
            }
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            _chatUsage.RecordFailure(kind, ex.GetType().Name);
            state = "unreachable";
            payload = new { ok = false, state, message = "Could not reach the provider (timeout or network)." };
        }

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Configuration,
            "Integration.ProviderCheck",
            "Provider",
            kind.ToString(),
            kind.ToString(),
            summary: $"{kind} health check: {state}.");
        await _db.SaveChangesAsync(cancellationToken);
        return Json(payload);
    }

    [AllowAnonymous]
    [Route("Home/NotFoundPage")]
    [Route("NotFound")]
    [Route("404")]
    public IActionResult NotFoundPage(int? statusCode = null)
    {
        var reExecute = HttpContext.Features.Get<Microsoft.AspNetCore.Diagnostics.IStatusCodeReExecuteFeature>();
        var code = statusCode
            ?? reExecute?.OriginalStatusCode
            ?? Response.StatusCode;

        if (code is < 400 or >= 600)
        {
            code = 404;
        }

        // Recycle the same NotFound page for known statuses; map other 4xx/5xx nearby.
        code = code switch
        {
            400 or 401 or 403 or 404 or 500 or 503 => code,
            >= 500 => 500,
            _ => 404
        };

        Response.StatusCode = code;
        return View("NotFound", StatusErrorPageModel.ForStatus(code));
    }

    [AllowAnonymous]
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        Response.StatusCode = 500;
        return View("NotFound", StatusErrorPageModel.ForStatus(500));
    }

    /// <summary>Provider errors worth one retry before declaring the health check failed.</summary>
    private static bool IsTransient(ChatCompletionResult result) =>
        !result.Succeeded
        && !result.QuotaExhausted
        && !result.NotConfigured
        && result.ErrorKind is "http_500" or "http_502" or "http_503" or "http_504" or "timeout" or "exception";

    private async Task<IntegrationSettingsViewModel> BuildIntegrationModelAsync(CancellationToken cancellationToken)
    {
        var model = new IntegrationSettingsViewModel
        {
            SenderEmail = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken),
            SmtpPasswordConfigured = await _vault.HasValueAsync(SecureSettingKeys.EmailPassword, cancellationToken),
            GeminiConfigured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken),
            GeminiKeyName = await _vault.GetAsync(SecureSettingKeys.GeminiKeyName, cancellationToken),
            GroqConfigured = await _vault.HasValueAsync(SecureSettingKeys.GroqApiKey, cancellationToken),
            GroqKeyName = await _vault.GetAsync(SecureSettingKeys.GroqKeyName, cancellationToken),
            GoogleLoginEnabled = await _googleAuth.IsEnabledAsync(cancellationToken),
            GoogleClientId = await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken),
            GoogleClientSecretConfigured = await _vault.HasValueAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken)
        };
        await FillIntegrationTelemetryAsync(model, cancellationToken);
        return model;
    }

    private async Task FillIntegrationTelemetryAsync(
        IntegrationSettingsViewModel model,
        CancellationToken cancellationToken)
    {
        var gemini = _chatUsage.GetHealth(ChatProviderKind.Gemini);
        var groq = _chatUsage.GetHealth(ChatProviderKind.Groq);
        model.GeminiLastOkUtc = gemini.LastSuccessUtc;
        model.GeminiLastErrorUtc = gemini.LastErrorUtc;
        model.GeminiLastError = gemini.LastError;
        model.GroqLastOkUtc = groq.LastSuccessUtc;
        model.GroqLastErrorUtc = groq.LastErrorUtc;
        model.GroqLastError = groq.LastError;
        model.SmtpLastOkUtc = _emailTelemetry.LastSuccessUtc;
        model.SmtpLastErrorUtc = _emailTelemetry.LastErrorUtc;
        model.SmtpLastError = _emailTelemetry.LastError;
        model.GoogleLastSignInUtc = await _db.SystemAuditLogs
            .AsNoTracking()
            .Where(row => row.Domain == SystemAuditDomain.Account
                && (row.Action == "Auth.GoogleStaffSignIn" || row.Action == "Auth.GoogleStaffConfirm"))
            .OrderByDescending(row => row.AtUtc)
            .Select(row => (DateTime?)row.AtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<IntegrationSettingsViewModel> MergeIntegrationDisplayAsync(
        IntegrationSettingsViewModel model,
        CancellationToken cancellationToken)
    {
        model.SmtpPassword = null;
        model.GeminiApiKey = null;
        model.GroqApiKey = null;
        model.GoogleClientSecret = null;
        model.CurrentPassword = string.Empty;
        model.SmtpPasswordConfigured = await _vault.HasValueAsync(SecureSettingKeys.EmailPassword, cancellationToken);
        model.GeminiConfigured = await _vault.HasValueAsync(SecureSettingKeys.GeminiApiKey, cancellationToken);
        model.GroqConfigured = await _vault.HasValueAsync(SecureSettingKeys.GroqApiKey, cancellationToken);
        model.GoogleClientSecretConfigured = await _vault.HasValueAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken);
        model.SenderEmail ??= await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
        model.GeminiKeyName ??= await _vault.GetAsync(SecureSettingKeys.GeminiKeyName, cancellationToken);
        model.GroqKeyName ??= await _vault.GetAsync(SecureSettingKeys.GroqKeyName, cancellationToken);
        model.GoogleClientId ??= await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken);
        await FillIntegrationTelemetryAsync(model, cancellationToken);
        return model;
    }
}
