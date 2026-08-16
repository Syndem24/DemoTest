namespace TestingDemo.Services;

public enum ReceiptOcrEngine
{
    Azure = 0,
    Unavailable = 1,
    QuotaExceeded = 2,
    Fallback = 3
}

public sealed record ReceiptOcrResult(
    ReceiptOcrEngine Engine,
    string Text,
    string? FallbackReason = null,
    int? PagesUsedThisMonth = null,
    int? MonthlyBudget = null);

public interface IReceiptOcrService
{
    /// <summary>
    /// Runs Azure Document Intelligence prebuilt-read when configured and within budget.
    /// Returns Fallback/Unavailable/QuotaExceeded so the client can use Tesseract.
    /// </summary>
    Task<ReceiptOcrResult> AnalyzeAsync(
        Stream imageStream,
        string? fileName,
        string? contentType,
        CancellationToken cancellationToken = default);
}
