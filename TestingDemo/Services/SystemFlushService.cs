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
        // Pending counts match respective pages:
        // Booking History: matches the Archive page (archived bookings)
        var history = await _db.Bookings.AsNoTracking().CountAsync(b => b.IsArchived, cancellationToken);
        // Payments: matches the Payments page (payment records)
        var payments = await _db.PaymentRecords.AsNoTracking().CountAsync(cancellationToken);
        // Staff Audit / Audit Log: matches the System audit log table above
        var staffAudit = await _db.SystemAuditLogs.AsNoTracking().CountAsync(cancellationToken);

        return new SystemFlushPendingCountsDto(history, payments, staffAudit);
    }

    public async Task<FlushSystemLogsResult> FlushSelectedAsync(
        IReadOnlyList<SystemFlushKind> kinds,
        string performedBy,
        FlushDateRange dateRange = default,
        bool clearAfterExport = true,
        CancellationToken cancellationToken = default)
    {
        performedBy = performedBy?.Trim() ?? string.Empty;
        if (performedBy.Length < 2 || performedBy.Length > 120)
        {
            throw new ArgumentException("Could not identify the staff account for this export.");
        }

        var selected = kinds
            .Distinct()
            .OrderBy(FlushOrder)
            .ToList();
        if (selected.Count == 0)
        {
            throw new ArgumentException("Select at least one log type to export.");
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
                        var result = await _bookingService.FlushHistoryAsync(
                            performedBy,
                            dateRange,
                            clearAfterExport,
                            cancellationToken);
                        files.Add((result.PdfBytes, result.FileName));
                        logs.Add(MapFromHistory(result.Log));
                        break;
                    }
                    case SystemFlushKind.Payments:
                    {
                        var result = await _paymentService.FlushPaymentsAsync(
                            performedBy,
                            dateRange,
                            clearAfterExport,
                            cancellationToken);
                        files.Add((result.PdfBytes, result.FileName));
                        logs.Add(MapFromPayment(result.Log));
                        break;
                    }
                    case SystemFlushKind.StaffAudit:
                    {
                        var result = await FlushStaffAuditAsync(
                            performedBy,
                            dateRange,
                            clearAfterExport,
                            cancellationToken);
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
                    : "Nothing was exported.");
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
        FlushDateRange dateRange,
        bool clearAfterExport,
        CancellationToken cancellationToken)
    {
        // EnableRetryOnFailure requires transactions to run inside CreateExecutionStrategy().
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            var rows = await _auditQuery.GetAuditExportRowsAsync(domain: null, dateRange, cancellationToken);
            if (rows.Count == 0)
            {
                throw new ArgumentException(
                    dateRange.HasFilter
                        ? "No audit log rows in that date range — nothing to export."
                        : "Audit log is empty — nothing to export.");
            }

            var flushedAtUtc = DateTime.UtcNow;
            var stamp = PhilippinesTime.ToManila(flushedAtUtc).ToString("yyyyMMdd-HHmm");
            var fileName = $"Mori-AuditLog-Export-{stamp}.pdf";
            var logoPath = Path.Combine(_environment.WebRootPath, "Images", "Logo.png");
            var pdfBytes = StaffAuditPdfBuilder.Build(
                rows,
                performedBy,
                flushedAtUtc,
                logoPath,
                title: "System audit log",
                subtitle: "System & staff audit events · official record export",
                footerLabel: "system audit export");
            var clearNote = clearAfterExport
                ? " then deleted."
                : " Data was kept (export only).";
            var summary =
                $"{rows.Count} audit log row{(rows.Count == 1 ? "" : "s")} exported to {fileName},{clearNote}{dateRange.DescribeForSummary()}";

            if (clearAfterExport)
            {
                await _auditQuery.DeleteDomainInRangeAsync(
                    domain: null,
                    dateRange,
                    cancellationToken);
            }

            var log = new SystemFlushLog
            {
                Kind = SystemFlushKind.StaffAudit,
                FlushedAtUtc = flushedAtUtc,
                PerformedBy = performedBy,
                RecordCount = rows.Count,
                FileName = fileName,
                Summary = summary.Length > 2000 ? summary[..2000] : summary
            };
            _db.SystemFlushLogs.Add(log);
            _audit.Record(
                SystemAuditIntent.FileModification,
                SystemAuditDomain.File,
                "SystemAudit.Export",
                clearAfterExport ? "Flush" : "Export",
                fileName,
                fileName,
                summary: summary);
            await _db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return (pdfBytes, fileName, Map(log));
        });
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
        SystemFlushKind.StaffAudit => "System audit log",
        _ => kind.ToString()
    };
}
