using Microsoft.AspNetCore.Identity;
using TestingDemo.Models;

namespace TestingDemo.Middleware;

/// <summary>
/// Forces MustChangePassword users onto the change-password page (not Identity lockout).
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
                if (user?.MustChangePassword == true)
                {
                    context.Response.Redirect("/Account/ChangePassword");
                    return;
                }
            }
        }

        await _next(context);
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
