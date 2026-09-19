using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;
using TestingDemo.Hubs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[ApiController]
[Route("api/admin/payments")]
[Authorize(Roles = "AdminManager,Receptionist")]
public sealed class AdminPaymentsApiController : ControllerBase
{
    private readonly IPaymentService _paymentService;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminPaymentsApiController(
        IPaymentService paymentService,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub,
        UserManager<ApplicationUser> userManager)
    {
        _paymentService = paymentService;
        _hub = hub;
        _userManager = userManager;
    }

    [HttpGet]
    public async Task<ActionResult<PagedPaymentsDto>> GetPayments(
        [FromQuery] string? search,
        [FromQuery] PaymentMethod? method,
        [FromQuery] DateOnly? paidOn,
        [FromQuery] string? receivedBy,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken cancellationToken = default)
    {
        return Ok(await _paymentService.GetPagedAsync(
            search,
            method,
            page,
            pageSize,
            cancellationToken,
            paidOn,
            receivedBy));
    }

    [HttpGet("collectors")]
    public async Task<ActionResult<IReadOnlyList<string>>> GetCollectors(
        CancellationToken cancellationToken)
    {
        return Ok(await _paymentService.GetCollectorsAsync(cancellationToken));
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
            var user = await _userManager.GetUserAsync(User);
            request.ReceivedBy = StaffDisplayName.FromUser(user, User);
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

    [HttpPost("{id:int}/refund")]
    [HttpPost("{id:int}/void")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<PaymentRecordDto>> RefundPayment(
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

    /// <summary>
    /// Marks a posted e-wallet payment as manually verified by front-desk staff
    /// (receipt checked on the guest's phone — no photo stored).
    /// </summary>
    [HttpPost("{id:int}/verify")]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult<PaymentRecordDto>> VerifyPayment(
        int id,
        CancellationToken cancellationToken)
    {
        try
        {
            var payment = await _paymentService.VerifyAsync(id, cancellationToken);
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
                cancellationToken: cancellationToken);
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
        catch (Exception)
        {
            return BadRequest(new
            {
                message = "Export failed. Please try again in a moment. If it keeps failing, contact support."
            });
        }
    }
}
