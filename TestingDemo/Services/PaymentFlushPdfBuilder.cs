using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Builds a branded softcopy PDF of company payment records before export deletion.
/// Detail rows stay on data pages; totals live on a dedicated last summary page.
/// </summary>
public static class PaymentFlushPdfBuilder
{
    private static readonly Color Navy = Color.FromHex("#0B1F33");
    private static readonly Color Teal = Color.FromHex("#0E8F8F");
    private static readonly Color TealDeep = Color.FromHex("#0A6B6B");
    private static readonly Color Line = Color.FromHex("#B8D4D4");
    private static readonly Color HeaderBg = Color.FromHex("#D6F0F0");

    public static byte[] Build(
        IReadOnlyList<PaymentRecord> payments,
        string performedBy,
        DateTime flushedAtUtc,
        string? logoPath)
    {
        var flushedLocal = PhilippinesTime.ToManila(flushedAtUtc);
        var rows = payments
            .OrderByDescending(p => p.PaidAtUtc)
            .ThenByDescending(p => p.Id)
            .ToList();

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(28);
                page.MarginVertical(22);
                page.DefaultTextStyle(text => text.FontSize(7).FontColor(Navy));

                page.Header().Element(header => ComposeDetailHeader(header, logoPath, flushedLocal, performedBy));
                page.Content().Element(content => ComposeTable(content, rows));
                page.Footer().Element(ComposeFooter);
            });

            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(28);
                page.MarginVertical(22);
                page.DefaultTextStyle(text => text.FontSize(9).FontColor(Navy));

                page.Header().Element(header => ComposeSummaryHeader(header, logoPath, flushedLocal, performedBy));
                page.Content().Element(content => ComposeSummary(content, rows, flushedLocal, performedBy));
                page.Footer().Element(ComposeFooter);
            });
        }).GeneratePdf();
    }

    private static void ComposeDetailHeader(
        IContainer container,
        string? logoPath,
        DateTime flushedLocal,
        string performedBy)
    {
        container.PaddingBottom(6).Column(column =>
        {
            column.Item().Row(row =>
            {
                row.ConstantItem(36).Height(36).Element(logo => ComposeLogo(logo, logoPath));
                row.RelativeItem().PaddingLeft(8).AlignMiddle().Column(brand =>
                {
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Official Payment Softcopy")
                        .FontSize(11).Bold().FontColor(TealDeep);
                    brand.Item().Text("Trademark & proprietary company payment record · detail table (summary on last page)")
                        .FontSize(7).Italic().FontColor(Teal);
                });
            });

            column.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Teal);
            column.Item().PaddingTop(4).Text(
                    $"Exported: {flushedLocal:MMM d, yyyy h:mm tt} (PH)  ·  By: {performedBy}  ·  Detail records · Softcopy prior to permanent deletion")
                .FontSize(7);
        });
    }

    private static void ComposeSummaryHeader(
        IContainer container,
        string? logoPath,
        DateTime flushedLocal,
        string performedBy)
    {
        container.PaddingBottom(6).Column(column =>
        {
            column.Item().Row(row =>
            {
                row.ConstantItem(36).Height(36).Element(logo => ComposeLogo(logo, logoPath));
                row.RelativeItem().PaddingLeft(8).AlignMiddle().Column(brand =>
                {
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Payment Export Summary")
                        .FontSize(11).Bold().FontColor(TealDeep);
                    brand.Item().Text("Trademark & proprietary company payment record · totals only (separate from detail pages)")
                        .FontSize(7).Italic().FontColor(Teal);
                });
            });

            column.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Teal);
            column.Item().PaddingTop(4).Text(
                    $"Exported: {flushedLocal:MMM d, yyyy h:mm tt} (PH)  ·  By: {performedBy}  ·  Final summary page")
                .FontSize(7);
        });
    }

    private static void ComposeLogo(IContainer logo, string? logoPath)
    {
        if (!string.IsNullOrWhiteSpace(logoPath) && File.Exists(logoPath))
        {
            logo.Image(logoPath).FitArea();
        }
        else
        {
            logo.Background(Teal);
        }
    }

    private static void ComposeTable(IContainer container, IReadOnlyList<PaymentRecord> payments)
    {
        if (payments.Count == 0)
        {
            container.Text("No payment records.");
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(88);
                columns.ConstantColumn(78);
                columns.ConstantColumn(72);
                columns.RelativeColumn(1.2f);
                columns.ConstantColumn(52);
                columns.ConstantColumn(58);
                columns.ConstantColumn(54);
                columns.ConstantColumn(50);
                columns.RelativeColumn(0.9f);
                columns.ConstantColumn(42);
            });

            table.Header(header =>
            {
                header.Cell().Element(HeaderCell).Text("When (PH)");
                header.Cell().Element(HeaderCell).Text("Receipt");
                header.Cell().Element(HeaderCell).Text("Booking");
                header.Cell().Element(HeaderCell).Text("Guest");
                header.Cell().Element(HeaderCell).Text("Event");
                header.Cell().Element(HeaderCell).Text("Method");
                header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
                header.Cell().Element(HeaderCell).AlignRight().Text("Balance");
                header.Cell().Element(HeaderCell).Text("Staff");
                header.Cell().Element(HeaderCell).Text("Status");
            });

            var alt = false;
            foreach (var payment in payments)
            {
                var bg = alt ? Color.FromHex("#F0FAFA") : Colors.White;
                alt = !alt;
                var paidLocal = PhilippinesTime.ToManila(payment.PaidAtUtc);

                table.Cell().Element(c => BodyCell(c, bg)).Text($"{paidLocal:MMM d yyyy HH:mm}");
                table.Cell().Element(c => BodyCell(c, bg)).Text(payment.ReceiptNumber).Bold();
                table.Cell().Element(c => BodyCell(c, bg)).Text(payment.Booking?.Reference ?? "—");
                table.Cell().Element(c => BodyCell(c, bg)).Text(payment.Booking?.GuestName ?? "—");
                table.Cell().Element(c => BodyCell(c, bg)).Text(FormatEvent(payment.EventType));
                table.Cell().Element(c => BodyCell(c, bg)).Text(FormatMethod(payment.Method));
                table.Cell().Element(c => BodyCell(c, bg)).AlignRight().Text($"₱{payment.Amount:N2}");
                table.Cell().Element(c => BodyCell(c, bg)).AlignRight().Text($"₱{payment.BalanceAfter:N2}");
                table.Cell().Element(c => BodyCell(c, bg)).Text(payment.ReceivedBy);
                table.Cell().Element(c => BodyCell(c, bg)).Text(payment.Status.ToString());
            }
        });
    }

    private static void ComposeSummary(
        IContainer container,
        IReadOnlyList<PaymentRecord> payments,
        DateTime flushedLocal,
        string performedBy)
    {
        if (payments.Count == 0)
        {
            container.Text("No payment records were exported.");
            return;
        }

        var posted = payments.Count(p => p.Status == PaymentRecordStatus.Posted);
        var voided = payments.Count(p => p.Status == PaymentRecordStatus.Voided);
        var collected = payments
            .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount > 0)
            .Sum(p => p.Amount);
        var refunded = Math.Abs(payments
            .Where(p => p.Status == PaymentRecordStatus.Posted && p.Amount < 0)
            .Sum(p => p.Amount));
        var net = collected - refunded;
        var bookingCount = payments
            .Select(p => p.Booking?.Reference)
            .Where(r => !string.IsNullOrWhiteSpace(r))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();
        var paidStart = PhilippinesTime.ToManila(payments.Min(p => p.PaidAtUtc));
        var paidEnd = PhilippinesTime.ToManila(payments.Max(p => p.PaidAtUtc));

        var methods = payments
            .GroupBy(p => FormatMethod(p.Method))
            .OrderByDescending(g => g.Count())
            .Select(g => (
                Name: g.Key,
                Count: g.Count(),
                Amount: g.Where(p => p.Status == PaymentRecordStatus.Posted).Sum(p => p.Amount)))
            .ToList();

        var events = payments
            .GroupBy(p => FormatEvent(p.EventType))
            .OrderByDescending(g => g.Count())
            .Select(g => (Name: g.Key, Count: g.Count()))
            .ToList();

        container.Column(column =>
        {
            column.Item().Text("Export totals").FontSize(14).Bold().FontColor(TealDeep);
            column.Item().PaddingTop(4).Text(
                    "This page summarizes the exported payments only. Detail receipt rows are on the previous page(s).")
                .FontSize(8).FontColor(Teal);

            column.Item().PaddingTop(14).Element(box =>
            {
                box.Border(1).BorderColor(Teal).Background(HeaderBg).Padding(12).Column(stats =>
                {
                    stats.Item().Text($"Total payment records exported: {payments.Count}").FontSize(12).Bold();
                    stats.Item().PaddingTop(6).Text($"Posted: {posted}  ·  Voided: {voided}  ·  Distinct bookings: {bookingCount}")
                        .FontSize(10);
                    stats.Item().PaddingTop(6).Text($"Collected: ₱{collected:N2}").FontSize(11).Bold();
                    stats.Item().PaddingTop(3).Text($"Refunded: ₱{refunded:N2}").FontSize(10);
                    stats.Item().PaddingTop(3).Text($"Net collected: ₱{net:N2}").FontSize(11).Bold();
                    stats.Item().PaddingTop(4).Text(
                            $"Payment date range (PH): {paidStart:MMM d, yyyy} – {paidEnd:MMM d, yyyy}")
                        .FontSize(10);
                    stats.Item().PaddingTop(4).Text(
                            $"Exported by: {performedBy}  ·  {flushedLocal:MMM d, yyyy h:mm tt} (PH)")
                        .FontSize(9);
                });
            });

            column.Item().PaddingTop(16).Row(row =>
            {
                row.RelativeItem().PaddingRight(8).Element(c => ComposeCountBlock(c, "By event type", events));
                row.RelativeItem().PaddingLeft(8).Element(c => ComposeMethodBlock(c, methods));
            });
        });
    }

    private static void ComposeCountBlock(
        IContainer container,
        string title,
        IReadOnlyList<(string Name, int Count)> rows)
    {
        container.Border(1).BorderColor(Line).Padding(10).Column(column =>
        {
            column.Item().Text(title).FontSize(10).Bold().FontColor(Teal);
            column.Item().PaddingTop(6).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn();
                    columns.ConstantColumn(48);
                });

                foreach (var (name, count) in rows)
                {
                    table.Cell().PaddingVertical(2).Text(name).FontSize(9);
                    table.Cell().PaddingVertical(2).AlignRight().Text(count.ToString("N0")).FontSize(9).Bold();
                }
            });
        });
    }

    private static void ComposeMethodBlock(
        IContainer container,
        IReadOnlyList<(string Name, int Count, decimal Amount)> rows)
    {
        container.Border(1).BorderColor(Line).Padding(10).Column(column =>
        {
            column.Item().Text("By payment method").FontSize(10).Bold().FontColor(Teal);
            column.Item().PaddingTop(6).Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn();
                    columns.ConstantColumn(40);
                    columns.ConstantColumn(70);
                });

                table.Header(header =>
                {
                    header.Cell().Text("Method").FontSize(8).Bold();
                    header.Cell().AlignRight().Text("Count").FontSize(8).Bold();
                    header.Cell().AlignRight().Text("Posted ₱").FontSize(8).Bold();
                });

                foreach (var (name, count, amount) in rows)
                {
                    table.Cell().PaddingVertical(2).Text(name).FontSize(9);
                    table.Cell().PaddingVertical(2).AlignRight().Text(count.ToString("N0")).FontSize(9).Bold();
                    table.Cell().PaddingVertical(2).AlignRight().Text($"{amount:N2}").FontSize(9);
                }
            });
        });
    }

    private static IContainer HeaderCell(IContainer container)
    {
        return container
            .BorderBottom(1)
            .BorderColor(Teal)
            .Background(HeaderBg)
            .PaddingVertical(4)
            .PaddingHorizontal(3)
            .DefaultTextStyle(text => text.Bold().FontSize(7).FontColor(TealDeep));
    }

    private static IContainer BodyCell(IContainer container, Color background)
    {
        return container
            .BorderBottom(0.5f)
            .BorderColor(Line)
            .Background(background)
            .PaddingVertical(3)
            .PaddingHorizontal(3)
            .AlignTop();
    }

    private static string FormatEvent(PaymentEventType eventType) => eventType switch
    {
        PaymentEventType.ArrivalPayment => "Arrival",
        PaymentEventType.BalanceSettlement => "Balance",
        _ => eventType.ToString()
    };

    private static string FormatMethod(PaymentMethod method) => method switch
    {
        PaymentMethod.BankTransfer => "Bank/InstaPay",
        PaymentMethod.EWallet or PaymentMethod.Maya => "E-wallet",
        PaymentMethod.Card => "Card",
        _ => method.ToString()
    };

    private static void ComposeFooter(IContainer container)
    {
        container.AlignCenter().PaddingTop(6).Column(column =>
        {
            column.Item().LineHorizontal(0.5f).LineColor(Line);
            column.Item().PaddingTop(4).Text(text =>
            {
                text.Span("© Mori International Hotel. All rights reserved. ").FontSize(6.5f);
                text.Span("Page ").FontSize(6.5f);
                text.CurrentPageNumber().FontSize(6.5f);
                text.Span(" of ").FontSize(6.5f);
                text.TotalPages().FontSize(6.5f);
                text.Span("  ·  Official payment trademark softcopy").FontSize(6.5f).FontColor(Teal);
            });
        });
    }
}
