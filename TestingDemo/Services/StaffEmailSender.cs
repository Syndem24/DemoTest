using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IStaffEmailSender
{
    Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default);
    Task SendPasswordResetAsync(string toEmail, string resetUrl, CancellationToken cancellationToken = default);
    Task SendTestAsync(string toEmail, CancellationToken cancellationToken = default);
}

public sealed class SmtpStaffEmailSender : IStaffEmailSender, IStaffOnboardingEmailSender
{
    private readonly ISecureConfigStore _vault;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SmtpStaffEmailSender> _logger;

    public SmtpStaffEmailSender(
        ISecureConfigStore vault,
        IConfiguration configuration,
        ILogger<SmtpStaffEmailSender> logger)
    {
        _vault = vault;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<bool> IsConfiguredAsync(CancellationToken cancellationToken = default)
    {
        var sender = await _vault.GetAsync(SecureSettingKeys.EmailSender, cancellationToken);
        var password = await _vault.GetAsync(SecureSettingKeys.EmailPassword, cancellationToken);
        return !string.IsNullOrWhiteSpace(sender) && !string.IsNullOrWhiteSpace(password);
    }

    public async Task SendPasswordResetAsync(string toEmail, string resetUrl, CancellationToken cancellationToken = default)
    {
        var publicBase = GetPublicBaseUrl();
        var siteHost = GetPublicSiteHost(publicBase);
        var subject = "Password reset request — Mori International Hotel";
        var text = BuildPasswordResetText(resetUrl, siteHost, publicBase);
        var html = BuildPasswordResetHtml(resetUrl, siteHost, publicBase);
        await SendAsync(toEmail, subject, text, html, cancellationToken);
    }

    public async Task SendTestAsync(string toEmail, CancellationToken cancellationToken = default)
    {
        await SendAsync(
            toEmail,
            "Mori International Hotel SMTP test",
            "SMTP is configured. This test message contains no secrets.",
            htmlBody: null,
            cancellationToken);
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

        await SendAsync(
            user.Email,
            "Your Mori International Hotel staff account",
            $"""
            A staff account was created for you.

            Username: {user.UserName}
            Sign in and change the temporary password set by your administrator.

            Google verification:
            {googleVerifyUrl}
            """,
            htmlBody: null,
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
            From = new MailAddress(sender, "Mori International Hotel"),
            Subject = subject,
            Body = htmlBody ?? textBody,
            IsBodyHtml = htmlBody is not null,
            BodyEncoding = Encoding.UTF8,
            SubjectEncoding = Encoding.UTF8
        };
        message.To.Add(toEmail);

        if (htmlBody is not null)
        {
            message.AlternateViews.Add(
                AlternateView.CreateAlternateViewFromString(textBody, Encoding.UTF8, MediaTypeNames.Text.Plain));
            message.AlternateViews.Add(
                AlternateView.CreateAlternateViewFromString(htmlBody, Encoding.UTF8, MediaTypeNames.Text.Html));
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

    private static string BuildPasswordResetText(string resetUrl, string siteHost, string publicBase)
    {
        return $"""
            Mori International Hotel
            Staff account — password reset

            We received a request to reset the password for a Mori International Hotel staff account linked to this email.

            Open this address in your browser within one hour:
            {resetUrl}

            The address should begin with {siteHost}. If it does not, do not continue.

            This link can be used once. After you change your password, or after one hour, the link will no longer open.

            Security
            - Do not share this email or the reset link with anyone, including coworkers.
            - Mori International Hotel will never ask you to reply with your password, app password, or a code.
            - Do not reply to this message. This mailbox is not monitored.
            - If you did not request a reset, please reach out of the hotel staff and inform them about this email.
            - If you ignore this email, your password stays the same.

            Sign in after you finish: {publicBase}/Account/Login
            """;
    }

    private static string BuildPasswordResetHtml(string resetUrl, string siteHost, string publicBase)
    {
        var safeUrl = WebUtility.HtmlEncode(resetUrl);
        var safeHost = WebUtility.HtmlEncode(siteHost);
        var loginUrl = WebUtility.HtmlEncode($"{publicBase}/Account/Login");

        return $"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Password reset</title>
            </head>
            <body style="margin:0;padding:0;background:#f3f7f8;font-family:'Segoe UI',Arial,sans-serif;color:#0b1f3a;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7f8;padding:24px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d7dee6;border-radius:12px;overflow:hidden;">
                      <tr>
                        <td style="background:#0b1f3a;padding:22px 28px;">
                          <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#1aa6a6;font-weight:700;">Mori International Hotel</p>
                          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#ffffff;">Staff password reset</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px 28px 8px;font-size:15px;line-height:1.55;">
                          <p style="margin:0 0 14px;">Hello,</p>
                          <p style="margin:0 0 14px;">We received a request to reset the password for a Mori International Hotel staff account that uses this email address.</p>
                          <p style="margin:0 0 18px;">Use the button below within <strong>one hour</strong>. After you change your password, this link is turned off and cannot be opened again — even on the same device.</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                            <tr>
                              <td style="border-radius:8px;background:#1aa6a6;">
                                <a href="{safeUrl}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">Set a new password</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:0 0 14px;font-size:13px;color:#3d4f63;">The link should go to <strong>{safeHost}</strong>. If the address looks different, do not continue.</p>
                          <p style="margin:0 0 6px;font-size:15px;font-weight:700;">Please keep this email private</p>
                          <ul style="margin:0 0 16px;padding-left:18px;font-size:14px;line-height:1.5;">
                            <li>Do not share this email or the reset link with anyone.</li>
                            <li>We will never ask you to reply with your password or a code.</li>
                            <li>Do not reply to this message. This mailbox is not monitored.</li>
                            <li>If you did not request this, ignore the email. Your current password stays the same.</li>
                          </ul>
                          <p style="margin:0 0 18px;">When you are done, sign in at <a href="{loginUrl}" style="color:#1aa6a6;">{safeHost}/Account/Login</a>.</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 28px 22px;border-top:1px solid #e4ebf0;font-size:12px;line-height:1.45;color:#5b6b7c;">
                          Mori International Hotel · Mandaue City, Cebu<br />
                          Official staff notice. This is not a guest booking message.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """;
    }
}
