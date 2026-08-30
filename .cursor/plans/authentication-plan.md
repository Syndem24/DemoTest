# Authentication plan (archived)

**Status:** Archived — implemented in project (ASP.NET Core Identity staff auth + guest login UI).  
**Archived:** 2026-08-22  
**Do not treat as active work** unless revisiting auth.

## Goal

Staff authentication for Mori International Hotel admin tools, with guest-facing Sign In UI, Google account verification for onboarded staff, and AdminManager-only user creation.

## What shipped (summary)

- ASP.NET Core Identity (`ApplicationUser`, roles `AdminManager` / `Receptionist`)
- Bootstrap seed for first AdminManager
- Cookie auth; staff routes protected
- Create staff user (React admin page) with FullName, Phone, Email (merged login + Google), BirthDate, Address
- Must-change-password gate + Google verification OAuth flow
- Guest login page: centered card over blurred lounge photo, Accommodations-style header nav, Continue with Google (UI), navy/teal brand

## Key files

- `Controllers/AccountController.cs`, `AdminUsersController.cs`, `AdminUsersApiController.cs`, `GoogleVerificationController.cs`
- `Services/AdminManagerSeed.cs`, `StaffAccountCreateService.cs`, `GoogleVerificationTokenService.cs`
- `Middleware/MustChangePasswordMiddleware.cs`
- `Views/Account/Login.cshtml`, `ClientApp` create-staff React
- `wwwroot/css/booking.css` (`.guest-auth-login`)

## Deferred / follow-ups (not in this archive scope)

- Wire Continue with Google for real guest/staff OAuth sign-in (currently UI-only on login card)
- Forgot password flow
- Guest “Create Account” (link placeholder)

## Related conversation

Agent transcript covering auth implementation and login UI iterations.
