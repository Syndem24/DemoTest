using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/payments")]
public sealed class AdminPaymentsApiController : ControllerBase
{
    private readonly IPaymentService _paymentService;
    private readonly IPaymentReceiptStorage _receiptStorage;
    private readonly IReceiptOcrService _receiptOcr;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;

    public AdminPaymentsApiController(
        IPaymentService paymentService,
        IPaymentReceiptStorage receiptStorage,
        IReceiptOcrService receiptOcr,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub)
    {
        _paymentService = paymentService;
        _receiptStorage = receiptStorage;
        _receiptOcr = receiptOcr;
        _hub = hub;
    }

    [HttpGet]
    public async Task<ActionResult<PagedPaymentsDto>> GetPayments(
        [FromQuery] string? search,
        [FromQuery] PaymentMethod? method,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _paymentService.GetPagedAsync(search, method, page, pageSize, cancellationToken));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PaymentRecordDto>> GetPayment(
        int id,
        CancellationToken cancellationToken)
    {
        var payment = await _paymentService.GetByIdAsync(id, cancellationToken);
        return payment == null ? NotFound() : Ok(payment);
    }

    [HttpGet("booking/{bookingId:int}")]
    public async Task<ActionResult<BookingPaymentSummaryDto>> GetBookingSummary(
        int bookingId,
        CancellationToken cancellationToken)
    {
        var summary = await _paymentService.GetBookingSummaryAsync(bookingId, cancellationToken);
        return summary == null ? NotFound() : Ok(summary);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<PaymentRecordDto>> RecordPayment(
        [FromBody] RecordPaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var payment = await _paymentService.RecordAsync(request, cancellationToken);
            await _hub.Clients.All.PaymentChanged(payment.BookingId);
            return Ok(payment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Booking was not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/void")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<PaymentRecordDto>> VoidPayment(
        int id,
        [FromBody] VoidPaymentRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var payment = await _paymentService.VoidAsync(id, request, cancellationToken);
            await _hub.Clients.All.PaymentChanged(payment.BookingId);
            return Ok(payment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Payment was not found." });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    [HttpPost("{id:int}/receipt-details")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<PaymentRecordDto>> UpdateReceiptDetails(
        int id,
        [FromBody] UpdatePaymentReceiptDetailsRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var payment = await _paymentService.UpdateReceiptDetailsAsync(id, request, cancellationToken);
            await _hub.Clients.All.PaymentChanged(payment.BookingId);
            return Ok(payment);
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { message = "Payment was not found." });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Uploads an e-wallet receipt image before or after OCR review.
    /// </summary>
    [HttpPost("receipt-upload")]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(8_000_000)]
    public async Task<ActionResult<object>> UploadReceipt(
        [FromForm] int bookingId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Choose a receipt photo to upload." });
        }

        if (bookingId <= 0)
        {
            return BadRequest(new { message = "Booking id is required." });
        }

        try
        {
            await using var stream = file.OpenReadStream();
            var path = await _receiptStorage.SaveAsync(
                bookingId,
                $"pending-{bookingId}",
                stream,
                file.FileName,
                file.ContentType,
                cancellationToken);
            return Ok(new { path });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    /// <summary>
    /// Azure Document Intelligence prebuilt-read OCR for a receipt image.
    /// Returns engine Azure on success; otherwise Fallback/Unavailable/QuotaExceeded for client Tesseract.
    /// </summary>
    [HttpPost("receipt-ocr")]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(8_000_000)]
    public async Task<ActionResult<object>> AnalyzeReceiptOcr(
        [FromForm] int bookingId,
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Choose a receipt photo to analyze." });
        }

        if (bookingId <= 0)
        {
            return BadRequest(new { message = "Booking id is required." });
        }

        await using var stream = file.OpenReadStream();
        var result = await _receiptOcr.AnalyzeAsync(
            stream,
            file.FileName,
            file.ContentType,
            cancellationToken);

        return Ok(new
        {
            engine = result.Engine.ToString(),
            text = result.Text,
            fallbackReason = result.FallbackReason,
            pagesUsedThisMonth = result.PagesUsedThisMonth,
            monthlyBudget = result.MonthlyBudget,
        });
    }

    [HttpGet("flush-logs")]
    public async Task<ActionResult<IReadOnlyList<PaymentFlushLogDto>>> GetPaymentFlushLogs(
        CancellationToken cancellationToken)
    {
        return Ok(await _paymentService.GetPaymentFlushLogsAsync(cancellationToken));
    }

    [HttpPost("flush")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> FlushPayments(
        [FromBody] FlushPaymentsRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _paymentService.FlushPaymentsAsync(
                request.PerformedBy,
                cancellationToken);
            Response.Headers["X-Flush-Record-Count"] = result.Log.RecordCount.ToString();
            Response.Headers["X-Flush-Performed-By"] = result.Log.PerformedBy;
            Response.Headers.Append(
                "Access-Control-Expose-Headers",
                "Content-Disposition, X-Flush-Record-Count, X-Flush-Performed-By");
            return File(result.PdfBytes, "application/pdf", result.FileName);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
