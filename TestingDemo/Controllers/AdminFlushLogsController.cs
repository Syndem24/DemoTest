using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

[Authorize(Roles = AppRoles.AdminManager)]
public sealed class AdminFlushLogsController : Controller
{
    private readonly ISystemFlushService _flushService;
    private readonly ISystemAuditQuery _auditQuery;

    public AdminFlushLogsController(
        ISystemFlushService flushService,
        ISystemAuditQuery auditQuery)
    {
        _flushService = flushService;
        _auditQuery = auditQuery;
    }

    [HttpGet]
    public async Task<IActionResult> Index(
        string? q,
        SystemAuditDomain? domain,
        SystemFlushKind? kind,
        int page = 1,
        CancellationToken cancellationToken = default)
    {
        var model = await BuildModelAsync(q, domain, kind, page, cancellationToken);
        model.Message = TempData["Message"] as string;
        model.Error = TempData["Error"] as string;
        return View(model);
    }

    [HttpGet]
    public async Task<IActionResult> Suggestions(
        string? q,
        SystemAuditDomain? domain,
        CancellationToken cancellationToken)
    {
        var items = await _auditQuery.SuggestAsync(q, domain, 8, cancellationToken);
        return Json(items);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Flush(
        [FromForm] string performedBy,
        [FromForm] List<SystemFlushKind>? kinds,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await _flushService.FlushSelectedAsync(
                kinds ?? new List<SystemFlushKind>(),
                performedBy,
                cancellationToken);

            var note = result.Skipped.Count > 0
                ? " Some selected types were skipped: " + string.Join(" ", result.Skipped)
                : string.Empty;
            var flushed = string.Join(
                ", ",
                result.Logs.Select(log => $"{log.KindLabel} ({log.RecordCount})"));

            if (result.Files.Count == 1)
            {
                TempData["Message"] = $"Exported {flushed}.{note}";
                Response.Headers["X-Flush-Record-Count"] = result.Logs.Sum(l => l.RecordCount).ToString();
                return File(result.Files[0].Bytes, "application/pdf", result.Files[0].FileName);
            }

            if (result.Files.Count > 1)
            {
                using var buffer = new MemoryStream();
                using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
                {
                    foreach (var file in result.Files)
                    {
                        var entry = zip.CreateEntry(file.FileName, CompressionLevel.Fastest);
                        using var stream = entry.Open();
                        await stream.WriteAsync(file.Bytes, cancellationToken);
                    }
                }

                buffer.Position = 0;
                var stamp = PhilippinesTime.ToManila(DateTime.UtcNow).ToString("yyyyMMdd-HHmm");
                TempData["Message"] = $"Exported {flushed}. Download the ZIP for every file.{note}";
                Response.Headers["X-Flush-Record-Count"] = result.Logs.Sum(l => l.RecordCount).ToString();
                return File(buffer.ToArray(), "application/zip", $"Mori-Flush-Export-{stamp}.zip");
            }

            TempData["Message"] = $"Exported {flushed}.{note}";
            return RedirectToAction(nameof(Index));
        }
        catch (ArgumentException ex)
        {
            var model = await BuildModelAsync(null, null, null, 1, cancellationToken);
            model.PerformedBy = performedBy ?? string.Empty;
            model.Kinds = kinds ?? new List<SystemFlushKind>();
            model.Error = ex.Message;
            return View("Index", model);
        }
    }

    private async Task<AdminFlushLogsViewModel> BuildModelAsync(
        string? search,
        SystemAuditDomain? domain,
        SystemFlushKind? kind,
        int page,
        CancellationToken cancellationToken)
    {
        var counts = await _flushService.GetPendingCountsAsync(cancellationToken);
        var logs = await _flushService.GetLogsAsync(kind, cancellationToken);
        var audit = await _auditQuery.GetPagedAsync(
            search,
            intent: null,
            domain,
            page,
            SystemAuditRecorder.DefaultPageSize,
            cancellationToken);

        return new AdminFlushLogsViewModel
        {
            Search = search,
            Domain = domain,
            Page = audit.Page,
            PageSize = audit.PageSize,
            AuditTotal = audit.Total,
            AuditRows = audit.Items,
            FilterKind = kind,
            HistoryPending = counts.BookingHistory,
            PaymentsPending = counts.Payments,
            StaffAuditPending = counts.StaffAudit,
            Logs = logs.Select(log => new AdminFlushLogRow
            {
                Id = log.Id,
                KindLabel = log.KindLabel,
                FlushedAtUtc = log.FlushedAtUtc,
                ExpiresAtUtc = log.ExpiresAtUtc,
                PerformedBy = log.PerformedBy,
                RecordCount = log.RecordCount,
                FileName = log.FileName,
                Summary = log.Summary
            }).ToList()
        };
    }
}
