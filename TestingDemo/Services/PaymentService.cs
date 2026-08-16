using System.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class PaymentService : IPaymentService
{
    public static readonly TimeSpan FlushLogRetention = TimeSpan.FromDays(7);

    private readonly HotelBookingDbContext _db;
    private readonly IWebHostEnvironment _environment;

    public PaymentService(HotelBookingDbContext db, IWebHostEnvironment environment)
    {
        _db = db;
        _environment = environment;
    }

    public async Task<PaymentRecordDto> RecordAsync(
        RecordPaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        var receivedBy = request.ReceivedBy?.Trim() ?? string.Empty;
        if (receivedBy.Length < 2 || receivedBy.Length > 120)
        {
            throw new ArgumentException("Enter the staff name who received payment (2–120 characters).");
        }

        if (request.Amount == 0)
        {
            throw new ArgumentException("Payment amount cannot be zero.");
        }

        if (request.EventType != PaymentEventType.Refund && request.Amount < 0)
        {
            throw new ArgumentException("Use Refund event type for negative amounts.");
        }

        if (request.EventType == PaymentEventType.Refund && request.Amount > 0)
        {
            request.Amount = -Math.Abs(request.Amount);
        }

        var booking = await _db.Bookings
            .Include(b => b.PaymentRecords)
            .FirstOrDefaultAsync(b => b.Id == request.BookingId, cancellationToken)
            ?? throw new KeyNotFoundException("Booking was not found.");

        var postedPaid = booking.PaymentRecords
            .Where(p => p.Status == PaymentRecordStatus.Posted)
            .Sum(p => p.Amount);

        var amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero);
        var stayTotal = booking.TotalAmount;
        var balanceDue = decimal.Round(stayTotal - postedPaid, 2, MidpointRounding.AwayFromZero);
        var notes = request.Notes;

        // Digital transfers often exceed the bill (wrong amount / OCR). Cap to balance and note excess.
        if (IsDigitalPaymentMethod(request.Method)
            && request.EventType is not PaymentEventType.Refund and not PaymentEventType.Adjustment
            && amount > 0)
        {
            if (balanceDue <= 0m)
            {
                throw new ArgumentException("This booking is already fully paid.");
            }

            if (amount > balanceDue)
            {
                var receiptAmount = amount;
                var excess = decimal.Round(receiptAmount - balanceDue, 2, MidpointRounding.AwayFromZero);
                amount = balanceDue;
                var capNote =
                    $"Receipt/transfer ₱{receiptAmount:N2} · Applied ₱{amount:N2} (excess ₱{excess:N2} not posted)";
                notes = string.IsNullOrWhiteSpace(notes) ? capNote : $"{notes.Trim()}\n{capNote}";
            }
        }

        var balanceAfter = decimal.Round(stayTotal - (postedPaid + amount), 2, MidpointRounding.AwayFromZero);

        // Bank transfer / e-wallet references and receipt image path come from the request.

        var now = DateTime.UtcNow;
        var record = new PaymentRecord
        {
            BookingId = booking.Id,
            ReceiptNumber = CreateReceiptNumber(),
            EventType = request.EventType,
            Method = request.Method,
            Amount = amount,
            StayTotalAtPosting = stayTotal,
            BalanceAfter = balanceAfter,
            PaidAtUtc = now,
            ReceivedBy = receivedBy,
            ExternalReference = TrimOrNull(request.ExternalReference, 120),
            BankTransferReference = TrimOrNull(request.BankTransferReference, 120),
            ReceiptImagePath = TrimOrNull(request.ReceiptImagePath, 500),
            Notes = TrimOrNull(notes, 1000),
            Status = PaymentRecordStatus.Posted
        };

        _db.PaymentRecords.Add(record);
        booking.UpdatedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);

        return Map(record, booking);
    }

    public async Task<PaymentRecordDto> VoidAsync(
        int paymentId,
        VoidPaymentRequest request,
        CancellationToken cancellationToken = default)
    {
        var voidedBy = request.VoidedBy?.Trim() ?? string.Empty;
        var reason = request.Reason?.Trim() ?? string.Empty;
        if (voidedBy.Length < 2)
        {
            throw new ArgumentException("Enter who is voiding this payment.");
        }

        if (reason.Length < 2)
        {
            throw new ArgumentException("Enter a void reason.");
        }

        var record = await _db.PaymentRecords
            .Include(p => p.Booking)
            .FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken)
            ?? throw new KeyNotFoundException("Payment was not found.");

        if (record.Status == PaymentRecordStatus.Voided)
        {
            throw new InvalidOperationException("Payment is already voided.");
        }

        var now = DateTime.UtcNow;
        record.Status = PaymentRecordStatus.Voided;
        record.VoidedAtUtc = now;
        record.VoidedBy = voidedBy;
        record.VoidReason = reason.Length > 500 ? reason[..500] : reason;
        record.Booking.UpdatedAtUtc = now;

        await RecalculateBalancesAsync(record.BookingId, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);

        return Map(record, record.Booking);
    }

    public async Task<PaymentRecordDto> UpdateReceiptDetailsAsync(
        int paymentId,
        UpdatePaymentReceiptDetailsRequest request,
        CancellationToken cancellationToken = default)
    {
        var record = await _db.PaymentRecords
            .Include(p => p.Booking)
            .FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken)
            ?? throw new KeyNotFoundException("Payment was not found.");

        if (record.Status == PaymentRecordStatus.Voided)
        {
            throw new InvalidOperationException("Voided payments cannot be edited.");
        }

        record.ExternalReference = TrimOrNull(request.ExternalReference, 120);

        var existingNotes = record.Notes ?? string.Empty;
        var channel = TrimOrNull(request.Channel, 40)
            ?? ExtractOcrField(existingNotes, "Channel")
            ?? "Digital";
        var from = TrimOrNull(request.TransferFrom, 160);
        var to = TrimOrNull(request.TransferTo, 160);
        var receiptAmount = request.ReceiptAmount is > 0
            ? decimal.Round(request.ReceiptAmount.Value, 2, MidpointRounding.AwayFromZero)
            : (decimal?)null;

        var partyBits = new List<string> { $"Channel: {channel}" };
        if (!string.IsNullOrWhiteSpace(from))
        {
            partyBits.Add($"From: {from}");
        }

        if (!string.IsNullOrWhiteSpace(to))
        {
            partyBits.Add($"To: {to}");
        }

        if (receiptAmount.HasValue)
        {
            partyBits.Add($"Receipt amount: ₱{receiptAmount.Value:N2}");
        }

        var stamp = $"Digital OCR · {string.Join(" · ", partyBits)}";
        if (System.Text.RegularExpressions.Regex.IsMatch(
                existingNotes,
                @"(?:Digital|E-wallet) OCR ·[^\n]*",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
        {
            record.Notes = TrimOrNull(
                System.Text.RegularExpressions.Regex.Replace(
                    existingNotes,
                    @"(?:Digital|E-wallet) OCR ·[^\n]*",
                    stamp,
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase),
                1000);
        }
        else
        {
            var combined = string.IsNullOrWhiteSpace(existingNotes)
                ? stamp
                : $"{existingNotes.Trim()}\n{stamp}";
            record.Notes = TrimOrNull(combined, 1000);
        }

        record.Booking.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync(cancellationToken);
        return Map(record, record.Booking);
    }

    private static string? ExtractOcrField(string notes, string label)
    {
        var match = System.Text.RegularExpressions.Regex.Match(
            notes,
            $@"{System.Text.RegularExpressions.Regex.Escape(label)}:\s*([^·\n]+)",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return match.Success ? TrimOrNull(match.Groups[1].Value, 160) : null;
    }

    public async Task<PagedPaymentsDto> GetPagedAsync(
        string? search,
        PaymentMethod? method,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = _db.PaymentRecords
            .AsNoTracking()
            .Include(p => p.Booking)
            .AsQueryable();

        if (method.HasValue)
        {
            if (method.Value == PaymentMethod.EWallet)
            {
                query = query.Where(p =>
                    p.Method == PaymentMethod.EWallet ||
                    p.Method == PaymentMethod.Maya);
            }
            else
            {
                query = query.Where(p => p.Method == method.Value);
            }
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p =>
                p.ReceiptNumber.Contains(term)
                || p.Booking.Reference.Contains(term)
                || p.Booking.GuestName.Contains(term)
                || (p.ExternalReference != null && p.ExternalReference.Contains(term))
                || (p.BankTransferReference != null && p.BankTransferReference.Contains(term)));
        }

        var total = await query.CountAsync(cancellationToken);
        var posted = query.Where(p => p.Status == PaymentRecordStatus.Posted);
        var totalCollected = await posted.Where(p => p.Amount > 0).SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;
        var totalRefunded = await posted.Where(p => p.Amount < 0).SumAsync(p => (decimal?)p.Amount, cancellationToken) ?? 0m;

        var items = await query
            .OrderByDescending(p => p.PaidAtUtc)
            .ThenByDescending(p => p.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return new PagedPaymentsDto(
            items.Select(p => Map(p, p.Booking)).ToList(),
            page,
            pageSize,
            total,
            totalCollected,
            Math.Abs(totalRefunded));
    }

    public async Task<BookingPaymentSummaryDto?> GetBookingSummaryAsync(
        int bookingId,
        CancellationToken cancellationToken = default)
    {
        var booking = await _db.Bookings
            .AsNoTracking()
            .Include(b => b.PaymentRecords)
            .FirstOrDefaultAsync(b => b.Id == bookingId, cancellationToken);

        if (booking is null)
        {
            return null;
        }

        var payments = booking.PaymentRecords
            .OrderByDescending(p => p.PaidAtUtc)
            .ThenByDescending(p => p.Id)
            .Select(p => Map(p, booking))
            .ToList();

        var paid = booking.PaymentRecords
            .Where(p => p.Status == PaymentRecordStatus.Posted)
            .Sum(p => p.Amount);

        return new BookingPaymentSummaryDto(
            booking.Id,
            booking.Reference,
            booking.GuestName,
            booking.TotalAmount,
            paid,
            decimal.Round(booking.TotalAmount - paid, 2, MidpointRounding.AwayFromZero),
            payments);
    }

    public async Task<PaymentRecordDto?> GetByIdAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var record = await _db.PaymentRecords
            .AsNoTracking()
            .Include(p => p.Booking)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

        return record is null ? null : Map(record, record.Booking);
    }

    public async Task<FlushPaymentsResult> FlushPaymentsAsync(
        string performedBy,
        CancellationToken cancellationToken = default)
    {
        performedBy = performedBy?.Trim() ?? string.Empty;
        if (performedBy.Length < 2 || performedBy.Length > 120)
        {
            throw new ArgumentException("Enter the staff name who is exporting payments (2–120 characters).");
        }

        await PurgeExpiredFlushLogsAsync(cancellationToken);

        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        // Only completed / archived stays — keep payment rows for active bookings.
        var payments = await _db.PaymentRecords
            .Include(p => p.Booking)
            .Where(p =>
                p.Booking.IsArchived
                || p.Booking.Status == BookingStatus.CheckedOut
                || p.Booking.Status == BookingStatus.Cancelled
                || p.Booking.Status == BookingStatus.Rejected)
            .OrderByDescending(p => p.PaidAtUtc)
            .ThenByDescending(p => p.Id)
            .ToListAsync(cancellationToken);

        if (payments.Count == 0)
        {
            throw new ArgumentException(
                "No completed-stay payments to export. Active bookings keep their payment records.");
        }

        var flushedAtUtc = DateTime.UtcNow;
        var stamp = PhilippinesTime.ToManila(flushedAtUtc).ToString("yyyyMMdd-HHmm");
        var fileName = $"Mori-Payment-Export-{stamp}.pdf";
        var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
        var pdfBytes = PaymentFlushPdfBuilder.Build(payments, performedBy, flushedAtUtc, logoPath);
        var summary = BuildFlushSummary(payments);
        var receiptPaths = payments
            .Select(p => p.ReceiptImagePath)
            .Where(path => !string.IsNullOrWhiteSpace(path))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        _db.PaymentRecords.RemoveRange(payments);

        var log = new PaymentFlushLog
        {
            FlushedAtUtc = flushedAtUtc,
            PerformedBy = performedBy,
            RecordCount = payments.Count,
            FileName = fileName,
            Summary = summary.Length > 2000 ? summary[..2000] : summary
        };
        _db.PaymentFlushLogs.Add(log);

        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        TryDeleteReceiptFiles(receiptPaths);

        return new FlushPaymentsResult(
            pdfBytes,
            fileName,
            MapFlushLog(log));
    }

    public async Task<IReadOnlyList<PaymentFlushLogDto>> GetPaymentFlushLogsAsync(
        CancellationToken cancellationToken = default)
    {
        await PurgeExpiredFlushLogsAsync(cancellationToken);

        return await _db.PaymentFlushLogs
            .AsNoTracking()
            .OrderByDescending(log => log.FlushedAtUtc)
            .Take(50)
            .Select(log => new PaymentFlushLogDto(
                log.Id,
                log.FlushedAtUtc,
                log.FlushedAtUtc.Add(FlushLogRetention),
                log.PerformedBy,
                log.RecordCount,
                log.FileName,
                log.Summary))
            .ToListAsync(cancellationToken);
    }

    private async Task PurgeExpiredFlushLogsAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(FlushLogRetention);
        var expired = await _db.PaymentFlushLogs
            .Where(log => log.FlushedAtUtc < cutoff)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
        {
            return;
        }

        _db.PaymentFlushLogs.RemoveRange(expired);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private void TryDeleteReceiptFiles(IEnumerable<string?> relativePaths)
    {
        foreach (var relative in relativePaths)
        {
            if (string.IsNullOrWhiteSpace(relative))
            {
                continue;
            }

            try
            {
                var trimmed = relative.TrimStart('~', '/').Replace('/', Path.DirectorySeparatorChar);
                var fullPath = Path.Combine(_environment.WebRootPath, trimmed);
                if (File.Exists(fullPath))
                {
                    File.Delete(fullPath);
                }
            }
            catch
            {
                // Best-effort cleanup; PDF softcopy is the retained record.
            }
        }
    }

    private static PaymentFlushLogDto MapFlushLog(PaymentFlushLog log)
    {
        return new PaymentFlushLogDto(
            log.Id,
            log.FlushedAtUtc,
            log.FlushedAtUtc.Add(FlushLogRetention),
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);
    }

    private static string BuildFlushSummary(IReadOnlyList<PaymentRecord> payments)
    {
        var posted = payments.Count(p => p.Status == PaymentRecordStatus.Posted);
        var voided = payments.Count(p => p.Status == PaymentRecordStatus.Voided);
        var collected = payments
            .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount > 0)
            .Sum(p => p.Amount);
        var refunded = Math.Abs(payments
            .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount < 0)
            .Sum(p => p.Amount));
        var methods = payments
            .GroupBy(p => p.Method)
            .OrderByDescending(g => g.Count())
            .Select(g => $"{FormatMethodLabel(g.Key)} ({g.Count()})")
            .Take(6);
        var bookings = payments
            .Select(p => p.Booking?.Reference)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        return string.Join(
            "\n",
            $"Posted {posted} · Voided {voided} · Bookings {bookings}",
            $"Collected ₱{collected:N2} · Refunded ₱{refunded:N2}",
            $"Methods: {string.Join(", ", methods)}",
            "Export log retained for 7 days, then auto-deleted.");
    }

    private static string FormatMethodLabel(PaymentMethod method) => method switch
    {
        PaymentMethod.BankTransfer => "Bank transfer",
        PaymentMethod.EWallet or PaymentMethod.Maya => "E-wallet",
        PaymentMethod.Card => "Card",
        _ => method.ToString()
    };

    private async Task RecalculateBalancesAsync(int bookingId, CancellationToken cancellationToken)
    {
        var booking = await _db.Bookings
            .Include(b => b.PaymentRecords)
            .FirstAsync(b => b.Id == bookingId, cancellationToken);

        decimal runningPaid = 0m;
        foreach (var payment in booking.PaymentRecords.OrderBy(p => p.PaidAtUtc).ThenBy(p => p.Id))
        {
            if (payment.Status != PaymentRecordStatus.Posted)
            {
                continue;
            }

            runningPaid += payment.Amount;
            payment.BalanceAfter = decimal.Round(
                booking.TotalAmount - runningPaid,
                2,
                MidpointRounding.AwayFromZero);
            payment.StayTotalAtPosting = booking.TotalAmount;
        }
    }

    private static string CreateReceiptNumber()
    {
        return $"PAY-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid():N}"[..22].ToUpperInvariant();
    }

    private static bool IsDigitalPaymentMethod(PaymentMethod method)
    {
        return method is PaymentMethod.EWallet
            or PaymentMethod.BankTransfer
            or PaymentMethod.Maya
            or PaymentMethod.Card;
    }

    private static string? TrimOrNull(string? value, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var trimmed = value.Trim();
        return trimmed.Length > maxLen ? trimmed[..maxLen] : trimmed;
    }

    private static PaymentRecordDto Map(PaymentRecord record, Booking booking)
    {
        return new PaymentRecordDto(
            record.Id,
            booking.Id,
            booking.Reference,
            booking.GuestName,
            record.ReceiptNumber,
            record.EventType,
            record.Method,
            record.Amount,
            record.StayTotalAtPosting,
            record.BalanceAfter,
            record.PaidAtUtc,
            record.ReceivedBy,
            record.ExternalReference,
            record.BankTransferReference,
            record.ReceiptImagePath,
            record.Notes,
            record.Status,
            record.VoidedAtUtc,
            record.VoidReason,
            record.VoidedBy);
    }
}
