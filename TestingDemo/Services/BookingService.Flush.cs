using System.Data;
using System.Globalization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed partial class BookingService
{
    public async Task<FlushBookingHistoryResult> FlushHistoryAsync(
        string performedBy,
        CancellationToken cancellationToken = default)
    {
        performedBy = performedBy?.Trim() ?? string.Empty;
        if (performedBy.Length < 2 || performedBy.Length > 120)
        {
            throw new ArgumentException("Enter the staff name who is exporting history (2â€“120 characters).");
        }

        await PurgeExpiredHistoryFlushLogsAsync(cancellationToken);

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
        var archived = await _db.Bookings
            .Include(booking => booking.Items)
                .ThenInclude(item => item.RoomAssignments)
                    .ThenInclude(assignment => assignment.Room)
            .Where(booking => booking.IsArchived)
            .OrderByDescending(booking => booking.ArchivedAtUtc ?? booking.UpdatedAtUtc)
            .ToListAsync(ct);

        if (archived.Count == 0)
        {
            throw new ArgumentException("History is empty â€” nothing to export.");
        }

        var flushedAtUtc = DateTime.UtcNow;
        var stamp = PhilippinesTime.ToManila(flushedAtUtc).ToString("yyyyMMdd-HHmm");
        var fileName = $"Mori-History-Export-{stamp}.pdf";
        var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
        var pdfBytes = BookingHistoryPdfBuilder.Build(archived, performedBy, flushedAtUtc, logoPath);

        var summary = BuildFlushSummary(archived);

        _db.Bookings.RemoveRange(archived);

        var log = new SystemFlushLog
        {
            Kind = SystemFlushKind.BookingHistory,
            FlushedAtUtc = flushedAtUtc,
            PerformedBy = performedBy,
            RecordCount = archived.Count,
            FileName = fileName,
            Summary = summary.Length > 2000 ? summary[..2000] : summary
        };
        _db.SystemFlushLogs.Add(log);
        _audit.Record(
            SystemAuditIntent.FileModification,
            SystemAuditDomain.File,
            "Booking.FlushExport",
            "Flush",
            fileName,
            fileName,
            summary: $"{archived.Count} archived stay(s) exported to {fileName}, then deleted.");

        await _db.SaveChangesAsync(ct);

        return new FlushBookingHistoryResult(
            pdfBytes,
            fileName,
            MapHistoryFlushLog(log));
        }, cancellationToken);
    }

    public async Task<IReadOnlyList<BookingHistoryFlushLogDto>> GetHistoryFlushLogsAsync(
        CancellationToken cancellationToken = default)
    {
        await PurgeExpiredHistoryFlushLogsAsync(cancellationToken);

        return await _db.SystemFlushLogs
            .AsNoTracking()
            .Where(log => log.Kind == SystemFlushKind.BookingHistory)
            .OrderByDescending(log => log.FlushedAtUtc)
            .Take(50)
            .Select(log => new BookingHistoryFlushLogDto(
                log.Id,
                log.FlushedAtUtc,
                log.FlushedAtUtc.Add(FlushLogRetention),
                log.PerformedBy,
                log.RecordCount,
                log.FileName,
                log.Summary))
            .ToListAsync(cancellationToken);
    }

    private async Task PurgeExpiredHistoryFlushLogsAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(FlushLogRetention);
        var expired = await _db.SystemFlushLogs
            .Where(log => log.Kind == SystemFlushKind.BookingHistory && log.FlushedAtUtc < cutoff)
            .ToListAsync(cancellationToken);

        if (expired.Count == 0)
        {
            return;
        }

        _db.SystemFlushLogs.RemoveRange(expired);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static BookingHistoryFlushLogDto MapHistoryFlushLog(SystemFlushLog log)
    {
        return new BookingHistoryFlushLogDto(
            log.Id,
            log.FlushedAtUtc,
            log.FlushedAtUtc.Add(FlushLogRetention),
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);
    }

    private static string BuildFlushSummary(IReadOnlyList<Booking> archived)
    {
        var checkedOut = archived.Count(b => b.Status == BookingStatus.CheckedOut);
        var cancelled = archived.Count(b => b.Status == BookingStatus.Cancelled);
        var other = archived.Count - checkedOut - cancelled;
        var totalValue = archived.Sum(b => b.TotalAmount);
        var stayStart = archived.Min(b => b.CheckInAtUtc);
        var stayEnd = archived.Max(b => b.CheckoutTimeUtc);
        var startLocal = PhilippinesTime.ToManila(stayStart);
        var endLocal = PhilippinesTime.ToManila(stayEnd);

        var roomTypes = archived
            .SelectMany(b => b.Items)
            .GroupBy(i => i.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Sum(i => i.Quantity))
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .Select(g => $"{g.Key} ({g.Sum(i => i.Quantity)})")
            .ToList();

        var statusParts = new List<string>();
        if (checkedOut > 0) statusParts.Add($"Checked out: {checkedOut}");
        if (cancelled > 0) statusParts.Add($"Cancelled: {cancelled}");
        if (other > 0) statusParts.Add($"Other: {other}");

        var lines = new List<string>
        {
            string.Join(" Â· ", statusParts),
            $"Stay range: {startLocal:MMM d, yyyy} â€“ {endLocal:MMM d, yyyy} (PH)",
            $"Total value: â‚±{totalValue:N2}",
            roomTypes.Count > 0
                ? $"Rooms: {string.Join(", ", roomTypes)}"
                : "Rooms: â€”",
            "Export log retained for 7 days, then auto-deleted."
        };

        var summary = string.Join('\n', lines);
        return summary.Length > 2000 ? summary[..2000] : summary;
    }
}
