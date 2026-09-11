using Microsoft.AspNetCore.Hosting;

namespace TestingDemo.Services;

/// <summary>
/// Stores e-payment receipt images under wwwroot/uploads/payment-receipts.
/// </summary>
public sealed class LocalPaymentReceiptStorage : IPaymentReceiptStorage
{
    /// <summary>Match AdminPaymentsApi upload RequestSizeLimit (8 MB).</summary>
    private const int MaxBytes = 8_000_000;

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

        if (content is null)
        {
            throw new ArgumentException("Receipt image is required.");
        }

        if (!AllowedContentTypes.Contains(contentType ?? string.Empty))
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

        try
        {
            await using var file = File.Create(absolutePath);
            await CopyLimitedAsync(content, file, MaxBytes, cancellationToken);
        }
        catch
        {
            TryDelete(absolutePath);
            throw;
        }

        return "/" + Path.Combine(relativeDir, storedName).Replace('\\', '/');
    }

    private static async Task CopyLimitedAsync(
        Stream source,
        Stream destination,
        int maxBytes,
        CancellationToken cancellationToken)
    {
        var chunk = new byte[81920];
        long written = 0;
        int read;
        while ((read = await source.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken)) > 0)
        {
            written += read;
            if (written > maxBytes)
            {
                throw new ArgumentException("Receipt image is too large (max 8 MB). Compress or use a smaller photo.");
            }

            await destination.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }

        if (written == 0)
        {
            throw new ArgumentException("Receipt image was empty.");
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
        }
        catch
        {
            // Best-effort cleanup after a failed write.
        }
    }
}
