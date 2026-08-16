using Azure;
using Azure.AI.DocumentIntelligence;
using Microsoft.Extensions.Options;

namespace TestingDemo.Services;

public sealed class AzureReceiptOcrService : IReceiptOcrService
{
    private const string ReadModelId = "prebuilt-read";
    private const int MaxBytes = 3_500_000; // Stay under F0 4 MB limit with headroom.

    private readonly AzureDocumentIntelligenceOptions _options;
    private readonly OcrUsageTracker _usage;
    private readonly ILogger<AzureReceiptOcrService> _logger;

    public AzureReceiptOcrService(
        IOptions<AzureDocumentIntelligenceOptions> options,
        OcrUsageTracker usage,
        ILogger<AzureReceiptOcrService> logger)
    {
        _options = options.Value;
        _usage = usage;
        _logger = logger;
    }

    public async Task<ReceiptOcrResult> AnalyzeAsync(
        Stream imageStream,
        string? fileName,
        string? contentType,
        CancellationToken cancellationToken = default)
    {
        var budget = Math.Max(0, _options.MonthlyPageBudget);
        var snapshot = _usage.GetSnapshot();

        if (!_options.Enabled
            || string.IsNullOrWhiteSpace(_options.Endpoint)
            || string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            return new ReceiptOcrResult(
                ReceiptOcrEngine.Unavailable,
                string.Empty,
                "Azure Document Intelligence is not configured.",
                snapshot.PagesUsed,
                budget);
        }

        if (snapshot.ForceFallback)
        {
            return new ReceiptOcrResult(
                ReceiptOcrEngine.QuotaExceeded,
                string.Empty,
                snapshot.ForceFallbackReason ?? "Azure free quota exhausted — using local OCR.",
                snapshot.PagesUsed,
                budget);
        }

        if (!_usage.TryReservePage(budget, out snapshot))
        {
            return new ReceiptOcrResult(
                ReceiptOcrEngine.QuotaExceeded,
                string.Empty,
                $"Monthly Azure OCR budget reached ({snapshot.PagesUsed}/{budget}). Using local OCR.",
                snapshot.PagesUsed,
                budget);
        }

        byte[] bytes;
        try
        {
            bytes = await ReadLimitedAsync(imageStream, MaxBytes, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return new ReceiptOcrResult(
                ReceiptOcrEngine.Fallback,
                string.Empty,
                ex.Message,
                snapshot.PagesUsed,
                budget);
        }

        if (bytes.Length == 0)
        {
            return new ReceiptOcrResult(
                ReceiptOcrEngine.Fallback,
                string.Empty,
                "Receipt image was empty.",
                snapshot.PagesUsed,
                budget);
        }

        try
        {
            var client = new DocumentIntelligenceClient(
                new Uri(_options.Endpoint.Trim()),
                new AzureKeyCredential(_options.ApiKey.Trim()));

            var analyzeOptions = new AnalyzeDocumentOptions(ReadModelId, BinaryData.FromBytes(bytes))
            {
                Locale = "en-US",
            };

            Operation<AnalyzeResult> operation = await client.AnalyzeDocumentAsync(
                WaitUntil.Completed,
                analyzeOptions,
                cancellationToken);

            var text = operation.Value?.Content?.Trim() ?? string.Empty;
            snapshot = _usage.RecordSuccess(1);

            if (string.IsNullOrWhiteSpace(text))
            {
                return new ReceiptOcrResult(
                    ReceiptOcrEngine.Fallback,
                    string.Empty,
                    "Azure returned no text — trying local OCR.",
                    snapshot.PagesUsed,
                    budget);
            }

            return new ReceiptOcrResult(
                ReceiptOcrEngine.Azure,
                text,
                null,
                snapshot.PagesUsed,
                budget);
        }
        catch (RequestFailedException ex) when (IsQuotaOrRateLimit(ex))
        {
            _logger.LogWarning(
                ex,
                "Azure Document Intelligence quota/rate limit hit (status {Status}). Forcing Tesseract fallback.",
                ex.Status);
            snapshot = _usage.MarkForceFallback(
                $"Azure free quota or rate limit (HTTP {ex.Status}). Using local OCR for the rest of this month.");
            return new ReceiptOcrResult(
                ReceiptOcrEngine.QuotaExceeded,
                string.Empty,
                snapshot.ForceFallbackReason,
                snapshot.PagesUsed,
                budget);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Azure Document Intelligence OCR failed; falling back to Tesseract.");
            return new ReceiptOcrResult(
                ReceiptOcrEngine.Fallback,
                string.Empty,
                "Azure OCR failed — using local OCR.",
                snapshot.PagesUsed,
                budget);
        }
    }

    private static bool IsQuotaOrRateLimit(RequestFailedException ex)
    {
        if (ex.Status is 429 or 403)
        {
            return true;
        }

        var code = ex.ErrorCode ?? string.Empty;
        var message = ex.Message ?? string.Empty;
        return code.Contains("Quota", StringComparison.OrdinalIgnoreCase)
            || code.Contains("RateLimit", StringComparison.OrdinalIgnoreCase)
            || message.Contains("quota", StringComparison.OrdinalIgnoreCase)
            || message.Contains("rate limit", StringComparison.OrdinalIgnoreCase)
            || message.Contains("exceeded", StringComparison.OrdinalIgnoreCase);
    }

    private static async Task<byte[]> ReadLimitedAsync(
        Stream stream,
        int maxBytes,
        CancellationToken cancellationToken)
    {
        await using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await stream.ReadAsync(chunk.AsMemory(0, chunk.Length), cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                throw new InvalidOperationException(
                    "Receipt image is too large for Azure free tier (max ~3.5 MB). Compress or use a smaller photo.");
            }

            await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken);
        }

        return buffer.ToArray();
    }
}
