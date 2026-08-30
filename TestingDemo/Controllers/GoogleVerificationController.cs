using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.Google;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[AllowAnonymous]
public class GoogleVerificationController : Controller
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IGoogleVerificationTokenService _tokens;
    private readonly ILogger<GoogleVerificationController> _logger;

    public GoogleVerificationController(
        UserManager<ApplicationUser> userManager,
        IGoogleVerificationTokenService tokens,
        ILogger<GoogleVerificationController> logger)
    {
        _userManager = userManager;
        _tokens = tokens;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> Begin(string token)
    {
        if (!_tokens.TryValidate(token, out var userId))
            return View("VerifyFailed");

        var googleId = HttpContext.RequestServices
            .GetRequiredService<IConfiguration>()["Authentication:Google:ClientId"];
        if (string.IsNullOrWhiteSpace(googleId))
        {
            _logger.LogWarning("Google verification requested but Authentication:Google:ClientId is not configured.");
            return View("VerifyFailed");
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null
            || user.GoogleVerificationStatus != GoogleVerificationStatus.PendingGoogleVerification
            || string.IsNullOrWhiteSpace(user.GoogleEmail))
        {
            return View("VerifyFailed");
        }

        var props = new GoogleChallengeProperties
        {
            RedirectUri = Url.Action(nameof(Callback), "GoogleVerification"),
            LoginHint = user.GoogleEmail
        };
        props.Items["purpose"] = "google-verify";
        props.Items["userId"] = user.Id;
        props.Items["expectedGoogleEmail"] = user.GoogleEmail;

        return Challenge(props, GoogleDefaults.AuthenticationScheme);
    }

    [HttpGet]
    public async Task<IActionResult> Callback()
    {
        var result = await HttpContext.AuthenticateAsync(GoogleDefaults.AuthenticationScheme);
        if (!result.Succeeded)
        {
            _logger.LogWarning("Google verification authenticate failed.");
            return View("VerifyFailed");
        }

        var items = result.Properties?.Items;
        if (items is null
            || !items.TryGetValue("purpose", out var purpose)
            || !items.TryGetValue("userId", out var userId)
            || !items.TryGetValue("expectedGoogleEmail", out var expected)
            || purpose != "google-verify"
            || string.IsNullOrEmpty(userId)
            || string.IsNullOrEmpty(expected))
        {
            return View("VerifyFailed");
        }

        var email = result.Principal?.FindFirstValue(ClaimTypes.Email)
                    ?? result.Principal?.FindFirstValue("email");
        var emailVerified = result.Principal?.FindFirstValue("email_verified");

        if (email is null
            || !string.Equals(email, expected, StringComparison.OrdinalIgnoreCase)
            || string.Equals(emailVerified, "false", StringComparison.OrdinalIgnoreCase))
        {
            await HttpContext.SignOutAsync(GoogleDefaults.AuthenticationScheme);
            _logger.LogWarning("Google verification email mismatch for user {UserId}.", userId);
            return View("VerifyFailed");
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null
            || user.GoogleVerificationStatus != GoogleVerificationStatus.PendingGoogleVerification
            || !string.Equals(user.GoogleEmail, expected, StringComparison.OrdinalIgnoreCase))
        {
            return View("VerifyFailed");
        }

        var googleSubject = result.Principal?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(googleSubject))
            return View("VerifyFailed");

        var info = new UserLoginInfo(GoogleDefaults.AuthenticationScheme, googleSubject, "Google");
        var link = await _userManager.AddLoginAsync(user, info);
        if (!link.Succeeded)
        {
            // Subject already linked elsewhere — generic failure (no enumeration detail)
            _logger.LogWarning(
                "AddLogin failed during Google verify for {UserId}: {Errors}",
                userId,
                string.Join("; ", link.Errors.Select(e => e.Description)));
            await HttpContext.SignOutAsync(GoogleDefaults.AuthenticationScheme);
            return View("VerifyFailed");
        }

        user.GoogleVerificationStatus = GoogleVerificationStatus.GoogleVerified;
        await _userManager.UpdateAsync(user);

        await HttpContext.SignOutAsync(GoogleDefaults.AuthenticationScheme);
        _logger.LogInformation("Google account verified for user {UserId}.", userId);
        return View("VerifySuccess");
    }
}
