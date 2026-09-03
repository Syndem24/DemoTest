using System.Net.Mail;
using System.Net.Mime;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using TestingDemo.Branding;

namespace TestingDemo.Services;

internal static class StaffEmailBranding
{
    public static string? ResolveLogoPath(IWebHostEnvironment environment)
    {
        var path = Path.Combine(environment.WebRootPath, HotelBrand.LogoRelativePath.Replace('/', Path.DirectorySeparatorChar));
        return File.Exists(path) ? path : null;
    }

    public static void AttachLogo(AlternateView htmlView, string? logoPath)
    {
        if (string.IsNullOrWhiteSpace(logoPath) || !File.Exists(logoPath))
        {
            return;
        }

        var linked = new LinkedResource(logoPath)
        {
            ContentId = HotelBrand.LogoContentId,
            TransferEncoding = TransferEncoding.Base64,
        };
        linked.ContentType = new ContentType("image/png");
        htmlView.LinkedResources.Add(linked);
    }

    public static string BuildLayout(string title, string bodyHtml, string publicBase, bool plainBrandName = false)
    {
        var safeTitle = Encode(title);
        var brandName = plainBrandName ? HotelBrand.Name : HotelBrand.Mark;
        var logoBlock = BuildLogoHeaderBlock(plainBrandName);
        var footer = $"""
            {brandName} · {HotelBrand.LocationLine}<br />
            Official staff notice. This is not a guest booking message.<br />
            <span style="font-size:11px;color:#7a8a9a;">{brandName}. All rights reserved.</span>
            """;

        return $"""
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>{safeTitle}</title>
            </head>
            <body style="margin:0;padding:0;background:#f3f7f8;font-family:'Segoe UI',Arial,sans-serif;color:{HotelBrand.Navy};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f7f8;padding:24px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d7dee6;border-radius:12px;overflow:hidden;">
                      <tr>
                        <td style="background:{HotelBrand.Navy};padding:20px 28px 18px;">
                          {logoBlock}
                          <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;color:#ffffff;">{safeTitle}</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px 28px 8px;font-size:15px;line-height:1.55;">
                          {bodyHtml}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 28px 22px;border-top:1px solid #e4ebf0;font-size:12px;line-height:1.45;color:#5b6b7c;">
                          {footer}
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

    public static string BuildLogoHeaderBlock(bool plainBrandName = false)
    {
        var brandLabel = plainBrandName
            ? Encode(HotelBrand.Name)
            : $"{Encode(HotelBrand.Name)}<span style=\"font-size:12px;vertical-align:super;color:{HotelBrand.Teal};\">{HotelBrand.Trademark}</span>";

        var logoImg = $"""
            <img src="cid:{HotelBrand.LogoContentId}"
                 alt="{Encode(plainBrandName ? HotelBrand.Name : HotelBrand.Mark)}"
                 width="52"
                 height="52"
                 style="display:block;width:52px;height:52px;border-radius:8px;background:rgba(255,255,255,0.08);padding:4px;object-fit:contain;" />
            """;

        return $"""
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;">{logoImg}</td>
                <td style="vertical-align:middle;padding-left:12px;">
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.15;font-weight:700;color:#ffffff;">
                    {brandLabel}
                  </p>
                  <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:{HotelBrand.Teal};font-weight:700;">Staff systems</p>
                </td>
              </tr>
            </table>
            """;
    }

    public static string Encode(string? value) => System.Net.WebUtility.HtmlEncode(value ?? string.Empty);

    public static string BuildTextFooter(bool plainBrandName = false)
    {
        var brandName = plainBrandName ? HotelBrand.Name : HotelBrand.Mark;
        return $"""
            {brandName}
            {HotelBrand.LocationLine}
            {brandName}. All rights reserved.
            """;
    }
}
