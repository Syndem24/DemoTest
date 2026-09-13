using System.IO.Compression;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
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
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminFlushLogsController(
        ISystemFlushService flushService,
        ISystemAuditQuery auditQuery,
        UserManager<ApplicationUser> userManager)
    {
        _flushService = flushService;
        _auditQuery = auditQuery;
        _userManager = userManager;
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
        [FromForm] List<SystemFlushKind>? kinds,
        [FromForm] DateOnly? fromDate,
        [FromForm] DateOnly? toDate,
        [FromForm] bool clearAfterExport,
        CancellationToken cancellationToken)
    {
        var wantsAjaxFile = IsAjaxFlushExportRequest();
        string performedBy;

        try
        {
            performedBy = await ResolveExporterNameAsync();
            var dateRange = FlushDateRange.FromManilaDates(fromDate, toDate);
            var result = await _flushService.FlushSelectedAsync(
                kinds ?? new List<SystemFlushKind>(),
                performedBy,
                dateRange,
                clearAfterExport,
                cancellationToken);

            var note = result.Skipped.Count > 0
                ? " Some selected types were skipped: " + string.Join(" ", result.Skipped)
                : string.Empty;
            var flushed = string.Join(
                ", ",
                result.Logs.Select(log => $"{log.KindLabel} ({log.RecordCount})"));
            var rangeNote = dateRange.HasFilter
                ? dateRange.DescribeForSummary()
                : string.Empty;
            var modeNote = clearAfterExport
                ? " Cleared matching records for the selected types. Use the Save dialog (or Downloads) for the PDF."
                : " Export only — records were kept. Use the Save dialog (or Downloads) for the PDF.";
            var message = result.Files.Count > 1
                ? $"Exported {flushed}. Download the ZIP for every file.{rangeNote}{modeNote}{note}"
                : $"Exported {flushed}.{rangeNote}{modeNote}{note}";

            if (result.Files.Count == 1)
            {
                if (!wantsAjaxFile)
                {
                    TempData["Message"] = message;
                }

                Response.Headers["X-Flush-Record-Count"] = result.Logs.Sum(l => l.RecordCount).ToString();
                Response.Headers["X-Flush-Message"] = message;
                Response.Headers.Append(
                    "Access-Control-Expose-Headers",
                    "Content-Disposition, X-Flush-Record-Count, X-Flush-Message");
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
                if (!wantsAjaxFile)
                {
                    TempData["Message"] = message;
                }

                Response.Headers["X-Flush-Record-Count"] = result.Logs.Sum(l => l.RecordCount).ToString();
                Response.Headers["X-Flush-Message"] = message;
                Response.Headers.Append(
                    "Access-Control-Expose-Headers",
                    "Content-Disposition, X-Flush-Record-Count, X-Flush-Message");
                return File(buffer.ToArray(), "application/zip", $"Mori-Flush-Export-{stamp}.zip");
            }

            TempData["Message"] = message;
            return RedirectToAction(nameof(Index));
        }
        catch (ArgumentException ex)
        {
            if (wantsAjaxFile)
            {
                return BadRequest(new { message = ex.Message });
            }

            var model = await BuildModelAsync(null, null, null, 1, cancellationToken);
            model.Kinds = kinds ?? new List<SystemFlushKind>();
            model.FromDate = fromDate;
            model.ToDate = toDate;
            model.Error = ex.Message;
            return View("Index", model);
        }
        catch (Exception ex)
        {
            var errorMessage = !string.IsNullOrWhiteSpace(ex.Message)
                ? ex.Message
                : "Export failed. Please try again in a moment. If it keeps failing, contact support.";

            if (wantsAjaxFile)
            {
                return BadRequest(new { message = errorMessage });
            }

            var model = await BuildModelAsync(null, null, null, 1, cancellationToken);
            model.Kinds = kinds ?? new List<SystemFlushKind>();
            model.FromDate = fromDate;
            model.ToDate = toDate;
            model.Error = errorMessage;
            return View("Index", model);
        }
    }

    private async Task<string> ResolveExporterNameAsync()
    {
        var user = await _userManager.GetUserAsync(User);
        var name = user?.FullName?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            name = user?.UserName?.Trim();
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            name = User.Identity?.Name?.Trim();
        }

        if (string.IsNullOrWhiteSpace(name) || name.Length < 2)
        {
            throw new ArgumentException("Could not identify the signed-in staff account for this export.");
        }

        return name.Length > 120 ? name[..120] : name;
    }

    private bool IsAjaxFlushExportRequest() =>
        string.Equals(Request.Headers["X-Flush-Export"], "1", StringComparison.OrdinalIgnoreCase);

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
