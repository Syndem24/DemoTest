using Microsoft.AspNetCore.Identity;
using TestingDemo.Models;

namespace TestingDemo.Middleware;

/// <summary>
/// Forces MustChangePassword users onto the change-password page (not Identity lockout).
/// Also gates Google guests who still have no local PasswordHash.
/// </summary>
public sealed class MustChangePasswordMiddleware
{
    private readonly RequestDelegate _next;

    public MustChangePasswordMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context, UserManager<ApplicationUser> userManager)
    {
        if (context.User.Identity?.IsAuthenticated == true)
        {
            var path = context.Request.Path;
            if (!IsExempt(path))
            {
                var user = await userManager.GetUserAsync(context.User);
                if (user is not null && await NeedsPasswordPageAsync(user, userManager))
                {
                    context.Response.Redirect("/Account/ChangePassword");
                    return;
                }
            }
        }

        await _next(context);
    }

    private static async Task<bool> NeedsPasswordPageAsync(
        ApplicationUser user,
        UserManager<ApplicationUser> userManager)
    {
        if (user.MustChangePassword)
            return true;

        if (!string.IsNullOrEmpty(user.PasswordHash))
            return false;

        if (!await userManager.IsInRoleAsync(user, AppRoles.Guest))
            return false;

        user.MustChangePassword = true;
        await userManager.UpdateAsync(user);
        return true;
    }

    private static bool IsExempt(PathString path)
    {
        return path.StartsWithSegments("/Account/ChangePassword")
               || path.StartsWithSegments("/Account/Logout")
               || path.StartsWithSegments("/Account/Login")
               || path.StartsWithSegments("/Account/ExternalLogin")
               || path.StartsWithSegments("/Account/ExternalLoginCallback")
               || path.StartsWithSegments("/Account/ConfirmStaffIdentity")
               || path.StartsWithSegments("/Booking/Terms")
               || path.StartsWithSegments("/Booking/PrivacyPolicy")
               || path.StartsWithSegments("/Account/DeclineGuestAgreement")
               || path.StartsWithSegments("/Account/ForgotPassword")
               || path.StartsWithSegments("/Account/VerifyResetOtp")
               || path.StartsWithSegments("/Account/ResetPassword")
               || path.StartsWithSegments("/Account/ResetPasswordInvalid")
               || path.StartsWithSegments("/css")
               || path.StartsWithSegments("/js")
               || path.StartsWithSegments("/lib")
               || path.StartsWithSegments("/Images")
               || path.StartsWithSegments("/locales")
               || path.StartsWithSegments("/_framework");
    }
}
