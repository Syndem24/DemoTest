using System.Data;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class SystemFlushService : ISystemFlushService
{
    public static readonly TimeSpan FlushLogRetention = TimeSpan.FromDays(7);

    private readonly HotelBookingDbContext _db;
    private readonly IBookingService _bookingService;
    private readonly IPaymentService _paymentService;
    private readonly IWebHostEnvironment _environment;
    private readonly ISystemAuditRecorder _audit;
    private readonly ISystemAuditQuery _auditQuery;

    public SystemFlushService(
        HotelBookingDbContext db,
        IBookingService bookingService,
        IPaymentService paymentService,
        IWebHostEnvironment environment,
        ISystemAuditRecorder audit,
        ISystemAuditQuery auditQuery)
    {
        _db = db;
        _bookingService = bookingService;
        _paymentService = paymentService;
        _environment = environment;
        _audit = audit;
        _auditQuery = auditQuery;
    }

    public async Task<IReadOnlyList<SystemFlushLogDto>> GetLogsAsync(
        SystemFlushKind? kind,
        CancellationToken cancellationToken = default)
    {
        await PurgeExpiredAsync(cancellationToken);

        var query = _db.SystemFlushLogs.AsNoTracking().AsQueryable();
        if (kind.HasValue)
        {
            query = query.Where(log => log.Kind == kind.Value);
        }

        var rows = await query
            .OrderByDescending(log => log.FlushedAtUtc)
            .ThenByDescending(log => log.Id)
            .Take(80)
            .ToListAsync(cancellationToken);

        return rows.Select(Map).ToList();
    }

    public async Task<SystemFlushPendingCountsDto> GetPendingCountsAsync(
        CancellationToken cancellationToken = default)
    {
        var history = await _db.Bookings.AsNoTracking()
            .CountAsync(booking => booking.IsArchived, cancellationToken);

        var payments = await _db.PaymentRecords.AsNoTracking()
            .CountAsync(
                p => p.Booking.IsArchived
                    || p.Booking.Status == BookingStatus.CheckedOut
                    || p.Booking.Status == BookingStatus.Cancelled
                    || p.Booking.Status == BookingStatus.Rejected,
                cancellationToken);

        var staffAudit = await _db.SystemAuditLogs.AsNoTracking()
            .CountAsync(row => row.Domain == SystemAuditDomain.Account, cancellationToken);

        return new SystemFlushPendingCountsDto(history, payments, staffAudit);
    }

    public async Task<FlushSystemLogsResult> FlushSelectedAsync(
        IReadOnlyList<SystemFlushKind> kinds,
        string performedBy,
        CancellationToken cancellationToken = default)
    {
        performedBy = performedBy?.Trim() ?? string.Empty;
        if (performedBy.Length < 2 || performedBy.Length > 120)
        {
            throw new ArgumentException("Enter the staff name who is flushing (2–120 characters).");
        }

        var selected = kinds
            .Distinct()
            .OrderBy(FlushOrder)
            .ToList();
        if (selected.Count == 0)
        {
            throw new ArgumentException("Select at least one log type to flush.");
        }

        var files = new List<(byte[] Bytes, string FileName)>();
        var logs = new List<SystemFlushLogDto>();
        var skipped = new List<string>();

        foreach (var kind in selected)
        {
            try
            {
                switch (kind)
                {
                    case SystemFlushKind.BookingHistory:
                    {
                        var result = await _bookingService.FlushHistoryAsync(performedBy, cancellationToken);
                        files.Add((result.PdfBytes, result.FileName));
                        logs.Add(MapFromHistory(result.Log));
                        break;
                    }
                    case SystemFlushKind.Payments:
                    {
                        var result = await _paymentService.FlushPaymentsAsync(performedBy, cancellationToken);
                        files.Add((result.PdfBytes, result.FileName));
                        logs.Add(MapFromPayment(result.Log));
                        break;
                    }
                    case SystemFlushKind.StaffAudit:
                    {
                        var result = await FlushStaffAuditAsync(performedBy, cancellationToken);
                        files.Add((result.PdfBytes, result.FileName));
                        logs.Add(result.Log);
                        break;
                    }
                    default:
                        throw new ArgumentException("Unknown log type.");
                }
            }
            catch (ArgumentException ex)
            {
                skipped.Add(ex.Message);
            }
        }

        if (logs.Count == 0)
        {
            throw new ArgumentException(
                skipped.Count > 0
                    ? string.Join(" ", skipped)
                    : "Nothing was flushed.");
        }

        return new FlushSystemLogsResult(files, logs, skipped);
    }

    /// <summary>
    /// Payments must run before booking history: deleting archived stays cascade-deletes payment rows.
    /// </summary>
    private static int FlushOrder(SystemFlushKind kind) => kind switch
    {
        SystemFlushKind.Payments => 0,
        SystemFlushKind.BookingHistory => 1,
        SystemFlushKind.StaffAudit => 2,
        _ => 9
    };

    private async Task<(byte[] PdfBytes, string FileName, SystemFlushLogDto Log)> FlushStaffAuditAsync(
        string performedBy,
        CancellationToken cancellationToken)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(
            IsolationLevel.Serializable,
            cancellationToken);

        var rows = await _auditQuery.GetStaffAccountAuditExportRowsAsync(cancellationToken);
        if (rows.Count == 0)
        {
            throw new ArgumentException("Staff audit is empty — nothing to flush.");
        }

        var flushedAtUtc = DateTime.UtcNow;
        var stamp = PhilippinesTime.ToManila(flushedAtUtc).ToString("yyyyMMdd-HHmm");
        var fileName = $"Mori-StaffAudit-Export-{stamp}.pdf";
        var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
        var pdfBytes = StaffAuditPdfBuilder.Build(rows, performedBy, flushedAtUtc, logoPath);
        var summary =
            $"{rows.Count} staff account audit row{(rows.Count == 1 ? "" : "s")} exported. Account history was kept.";

        var log = new SystemFlushLog
        {
            Kind = SystemFlushKind.StaffAudit,
            FlushedAtUtc = flushedAtUtc,
            PerformedBy = performedBy,
            RecordCount = rows.Count,
            FileName = fileName,
            Summary = summary
        };
        _db.SystemFlushLogs.Add(log);
        _audit.Record(
            SystemAuditIntent.FileModification,
            SystemAuditDomain.File,
            "StaffAudit.Export",
            "Flush",
            fileName,
            fileName,
            summary: summary);
        await _db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (pdfBytes, fileName, Map(log));
    }

    private async Task PurgeExpiredAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTime.UtcNow.Subtract(FlushLogRetention);
        var expired = await _db.SystemFlushLogs
            .Where(log => log.FlushedAtUtc < cutoff)
            .ToListAsync(cancellationToken);
        if (expired.Count == 0)
        {
            return;
        }

        _db.SystemFlushLogs.RemoveRange(expired);
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static SystemFlushLogDto Map(SystemFlushLog log) =>
        new(
            log.Id,
            log.Kind,
            KindLabel(log.Kind),
            log.FlushedAtUtc,
            log.FlushedAtUtc.Add(FlushLogRetention),
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);

    private static SystemFlushLogDto MapFromHistory(BookingHistoryFlushLogDto log) =>
        new(
            log.Id,
            SystemFlushKind.BookingHistory,
            KindLabel(SystemFlushKind.BookingHistory),
            log.FlushedAtUtc,
            log.ExpiresAtUtc,
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);

    private static SystemFlushLogDto MapFromPayment(PaymentFlushLogDto log) =>
        new(
            log.Id,
            SystemFlushKind.Payments,
            KindLabel(SystemFlushKind.Payments),
            log.FlushedAtUtc,
            log.ExpiresAtUtc,
            log.PerformedBy,
            log.RecordCount,
            log.FileName,
            log.Summary);

    public static string KindLabel(SystemFlushKind kind) => kind switch
    {
        SystemFlushKind.BookingHistory => "Booking history",
        SystemFlushKind.Payments => "Payments",
        SystemFlushKind.StaffAudit => "Staff audit",
        _ => kind.ToString()
    };
}
