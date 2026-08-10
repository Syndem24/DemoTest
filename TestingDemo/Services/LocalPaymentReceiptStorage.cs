using Microsoft.AspNetCore.Hosting;

namespace TestingDemo.Services;

/// <summary>
/// Stores e-payment receipt images under wwwroot/uploads/payment-receipts.
/// </summary>
public sealed class LocalPaymentReceiptStorage : IPaymentReceiptStorage
{
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif"
    };

    private readonly IWebHostEnvironment _environment;

    public LocalPaymentReceiptStorage(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public async Task<string> SaveAsync(
        int bookingId,
        string receiptNumber,
        Stream content,
        string fileName,
        string contentType,
        CancellationToken cancellationToken = default)
    {
        if (bookingId <= 0)
        {
            throw new ArgumentException("Booking id is required.");
        }

        if (!AllowedContentTypes.Contains(contentType))
        {
            throw new ArgumentException("Only image receipts are supported (JPG, PNG, WEBP).");
        }

        var ext = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(ext))
        {
            ext = contentType.Contains("png", StringComparison.OrdinalIgnoreCase) ? ".png"
                : contentType.Contains("webp", StringComparison.OrdinalIgnoreCase) ? ".webp"
                : ".jpg";
        }

        var safeReceipt = string.IsNullOrWhiteSpace(receiptNumber)
            ? Guid.NewGuid().ToString("N")[..12]
            : new string(receiptNumber.Where(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_').ToArray());
        if (safeReceipt.Length == 0)
        {
            safeReceipt = Guid.NewGuid().ToString("N")[..12];
        }

        var relativeDir = Path.Combine("uploads", "payment-receipts", bookingId.ToString());
        var absoluteDir = Path.Combine(_environment.WebRootPath, relativeDir);
        Directory.CreateDirectory(absoluteDir);

        var storedName = $"{DateTime.UtcNow:yyyyMMddHHmmss}-{safeReceipt}{ext.ToLowerInvariant()}";
        var absolutePath = Path.Combine(absoluteDir, storedName);

        await using (var file = File.Create(absolutePath))
        {
            await content.CopyToAsync(file, cancellationToken);
        }

        return "/" + Path.Combine(relativeDir, storedName).Replace('\\', '/');
    }
}
