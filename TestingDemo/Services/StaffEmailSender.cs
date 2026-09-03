using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using TestingDemo.Branding;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IStaffEmailSender
{
    Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default);
    Task SendPasswordResetOtpAsync(
        string toEmail,
        string otpCode,
        int expiryMinutes,
        CancellationToken cancellationToken = default);
    Task SendTestAsync(string toEmail, CancellationToken cancellationToken = default);
}

public sealed class SmtpStaffEmailSender : IStaffEmailSender, IStaffOnboardingEmailSender
{
    private readonly ISecureConfigStore _vault;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<SmtpStaffEmailSender> _logger;

    public SmtpStaffEmailSender(
        ISecureConfigStore vault,
        IConfiguration configuration,
        IWebHostEnvironment environment,
        ILogger<SmtpStaffEmailSender> logger)
    {
        _vault = vault;
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public async Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default)
    {
        var sender = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
        var password = await _vault.GetAsync(SecureSettingKeys.EmailPassword, cancellationToken);
        return !string.IsNullOrWhiteSpace(sender) && !string.IsNullOrWhiteSpace(password);
    }

    public async Task SendPasswordResetOtpAsync(
        string toEmail,
        string otpCode,
        int expiryMinutes,
        CancellationToken cancellationToken = default)
    {
        var publicBase = GetPublicBaseUrl();
        var siteHost = GetPublicSiteHost(publicBase);
        var verifyUrl = $"{publicBase}/Account/VerifyResetOtp";
        var subject = $"Staff password reset code — {HotelBrand.Name}";
        var text = BuildPasswordResetOtpText(otpCode, expiryMinutes, siteHost, verifyUrl);
        var html = BuildPasswordResetOtpHtml(otpCode, expiryMinutes, siteHost);
        await SendAsync(toEmail, subject, text, html, cancellationToken);
    }

    public async Task SendTestAsync(string toEmail, CancellationToken cancellationToken = default)
    {
        var publicBase = GetPublicBaseUrl();
        var bodyHtml = $"""
            <p style="margin:0 0 14px;">Hello,</p>
            <p style="margin:0 0 14px;">This is a test message from <strong>{StaffEmailBranding.Encode(HotelBrand.Mark)}</strong> staff email (SMTP).</p>
            <p style="margin:0 0 14px;">If you received this, Gmail SMTP is configured correctly. This message contains no secrets.</p>
            <p style="margin:0;font-size:13px;color:#3d4f63;">Sent from {StaffEmailBranding.Encode(publicBase)}</p>
            """;
        var html = StaffEmailBranding.BuildLayout("SMTP test", bodyHtml, publicBase);
        var text = $"""
            {HotelBrand.Mark} SMTP test

            SMTP is configured. This test message contains no secrets.

            {StaffEmailBranding.BuildTextFooter()}
            """;
        await SendAsync(toEmail, $"{HotelBrand.Mark} SMTP test", text, html, cancellationToken);
    }

    public async Task SendOnboardingAsync(
        ApplicationUser user,
        string temporaryPassword,
        string googleVerifyUrl,
        CancellationToken cancellationToken = default)
    {
        if (!await IsConfiguredAsync(cancellationToken) || string.IsNullOrWhiteSpace(user.Email))
        {
            _logger.LogWarning(
                "Staff onboarding for {UserName}. SMTP is not configured; temporary password was set by admin (value not logged).",
                user.UserName);
            return;
        }

        var publicBase = GetPublicBaseUrl();
        var loginUrl = StaffEmailBranding.Encode($"{publicBase}/Account/Login");
        var safeUser = StaffEmailBranding.Encode(user.UserName);
        var safeVerify = StaffEmailBranding.Encode(googleVerifyUrl);
        var bodyHtml = $"""
            <p style="margin:0 0 14px;">Hello,</p>
            <p style="margin:0 0 14px;">A staff account was created for you at <strong>{StaffEmailBranding.Encode(HotelBrand.Mark)}</strong>.</p>
            <p style="margin:0 0 8px;"><strong>Username:</strong> {safeUser}</p>
            <p style="margin:0 0 14px;">Sign in with the temporary password set by your administrator, then change it immediately.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
              <tr>
                <td style="border-radius:8px;background:{HotelBrand.Teal};">
                  <a href="{loginUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Sign in to staff portal</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:15px;font-weight:700;">Google verification</p>
            <p style="margin:0 0 14px;font-size:14px;"><a href="{safeVerify}" style="color:{HotelBrand.Teal};">{safeVerify}</a></p>
            """;
        var html = StaffEmailBranding.BuildLayout("Your staff account", bodyHtml, publicBase);
        var text = $"""
            {HotelBrand.Mark}
            Your staff account

            Username: {user.UserName}
            Sign in and change the temporary password set by your administrator.

            Sign in: {publicBase}/Account/Login

            Google verification:
            {googleVerifyUrl}

            {StaffEmailBranding.BuildTextFooter()}
            """;
        await SendAsync(
            user.Email,
            $"Your {HotelBrand.Mark} staff account",
            text,
            html,
            cancellationToken);
    }

    private async Task SendAsync(
        string toEmail,
        string subject,
        string textBody,
        string? htmlBody,
        CancellationToken cancellationToken)
    {
        var sender = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
        var password = await _vault.GetAsync(SecureSettingKeys.EmailPassword, cancellationToken);
        if (string.IsNullOrWhiteSpace(sender) || string.IsNullOrWhiteSpace(password))
        {
            _logger.LogWarning("SMTP send skipped: vault credentials are not configured.");
            throw new InvalidOperationException("SMTP is not configured.");
        }

        using var message = new MailMessage
        {
            From = new MailAddress(sender, HotelBrand.EmailSenderDisplayName),
            Subject = subject,
            Body = htmlBody ?? textBody,
            IsBodyHtml = htmlBody is not null,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8
        };
        message.To.Add(toEmail);

        if (htmlBody is not null)
        {
            var plainView = AlternateView.CreateAlternateViewFromString(textBody, Encoding.UTF8, MediaTypeNames.Text.Plain);
            message.AlternateViews.Add(plainView);

            var htmlView = AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, MediaTypeNames.Text.Html);
            StaffEmailBranding.AttachLogo(htmlView, StaffEmailBranding.ResolveLogoPath(_environment));
            message.AlternateViews.Add(htmlView);
        }

        using var client = new SmtpClient("smtp.gmail.com", 587)
        {
            EnableSsl = true,
            Credentials = new NetworkCredential(sender, password)
        };

        await client.SendMailAsync(message, cancellationToken);
        _logger.LogInformation("Staff email sent to a configured recipient.");
    }

    private string GetPublicBaseUrl()
        => (_configuration["PublicBaseUrl"] ?? "http://localhost:5288").Trim().TrimEnd('/');

    private static string GetPublicSiteHost(string publicBase)
        => Uri.TryCreate(publicBase, UriKind.Absolute, out var uri)
            ? uri.Authority
            : "localhost:5288";

    private static string BuildPasswordResetOtpText(
        string otpCode,
        int expiryMinutes,
        string siteHost,
        
        string verifyUrl)
    {
        return $"""
            {HotelBrand.Name}
            Staff account — password reset code

            We received a request to reset the password for a {HotelBrand.Name} staff account linked to this email.

            Your one-time verification code:
            {otpCode}

            Enter this code on the staff sign-in page within {expiryMinutes} minutes:
            {verifyUrl}

            This code works once. After you set a new password, or after {expiryMinutes} minutes, it will no longer work.
            After three incorrect attempts, this code is cancelled — request a new one.

            Security
            - Do not share this code or email with anyone, including coworkers.
            - {HotelBrand.Name} will never ask you to reply with your password or app password.
            - Do not reply to this message. This mailbox is not monitored.
            - If you did not request this, please contact the admin for further investigations.

            Site address: {siteHost}

            {StaffEmailBranding.BuildTextFooter(plainBrandName: true)}
            """;
    }

    private static string BuildPasswordResetOtpHtml(
        string otpCode,
        int expiryMinutes,
        string siteHost)
    {
        var safeCode = StaffEmailBranding.Encode(otpCode);
        var safeHost = StaffEmailBranding.Encode(siteHost);
        var brandName = StaffEmailBranding.Encode(HotelBrand.Name);

        var bodyHtml = $"""
            <p style="margin:0 0 14px;">Hello,</p>
            <p style="margin:0 0 14px;">We received a request to reset the password for a <strong>{brandName}</strong> staff account that uses this email address.</p>
            <p style="margin:0 0 12px;font-size:14px;color:#3d4f63;">Enter this one-time code within <strong>{expiryMinutes} minutes</strong>. It can be used only once. After three incorrect attempts, request a new code.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;width:100%;">
              <tr>
                <td align="center" style="padding:20px 16px;border-radius:12px;background:#f4f7fa;border:1px solid #d8e2ec;">
                  <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3d4f63;">Verification code</p>
                  <p style="margin:0;font-size:36px;font-weight:800;letter-spacing:0.35em;color:{HotelBrand.Teal};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">{safeCode}</p>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 14px;font-size:13px;color:#3d4f63;">Open <strong>go to the Website</strong>, navigate to <strong>Forgot password</strong>, then enter the code above. If the address looks different, do not continue.</p>
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;">Keep this code private</p>
            <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.5;">
              <li>Do not share this code or forward this email.</li>
              <li>We will never ask you to reply with your password or a code.</li>
              <li>Do not reply to this message. This mailbox is not monitored.</li>
              <li>If you did not request this, please contact the administrator for further investigations.</li>
            </ul>
            """;

        return StaffEmailBranding.BuildLayout("Staff password reset code", bodyHtml, string.Empty, plainBrandName: true);
    }
}
