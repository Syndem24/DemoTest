using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace TestingDemo.Services;

/// <summary>
/// Branded PDF of the operations report (dashboard Generate report → Save as PDF).
/// Tables first; chart summaries on a dedicated last page. Logo + trademark run
/// in the page header/footer so every page carries the official marks — same
/// pattern as the data-retention export PDFs.
/// </summary>
public static class OperationsReportPdfBuilder
{
    private static readonly Color Navy = Color.FromHex("#0B1F33");
    private static readonly Color Teal = Color.FromHex("#1AA6A6");
    private static readonly Color TealDeep = Color.FromHex("#0A6B6B");
    private static readonly Color Line = Color.FromHex("#B8D4D4");
    private static readonly Color HeaderBg = Color.FromHex("#D6F0F0");
    private static readonly Color Muted = Color.FromHex("#5A6B7A");

    public static byte[] Build(DashboardReportDto report, string? logoPath)
    {
        var generatedLocal = PhilippinesTime.ToManila(report.GeneratedAtUtc);
        var docRef = $"OPS-{report.GeneratedBy}-{report.GeneratedAtUtc:yyyy-MM-dd}";

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(28);
                page.MarginVertical(22);
                page.DefaultTextStyle(text => text.FontSize(7.5f).FontColor(Navy));

                page.Header().Element(header =>
                    ComposeHeader(header, logoPath, generatedLocal, report, docRef));
                page.Content().Element(content => ComposeBody(content, report));
                page.Footer().Element(footer => ComposeFooter(footer, report, docRef));
            });
        }).GeneratePdf();
    }

    /* ---- page furniture ------------------------------------------------- */

    private static void ComposeHeader(
        IContainer container,
        string? logoPath,
        DateTime generatedLocal,
        DashboardReportDto report,
        string docRef)
    {
        container.PaddingBottom(6).Column(column =>
        {
            column.Item().Row(row =>
            {
                row.ConstantItem(34).Height(34).Element(logo => ComposeLogo(logo, logoPath));
                row.RelativeItem().PaddingLeft(8).AlignMiddle().Column(brand =>
                {
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Official Operations Report")
                        .FontSize(11).Bold().FontColor(TealDeep);
                    brand.Item().Text(
                            $"Trademark & proprietary company record · Period {report.RangeLabel} · Doc ref {docRef}")
                        .FontSize(7).Italic().FontColor(Teal);
                });
                row.ConstantItem(150).AlignRight().AlignMiddle().Column(meta =>
                {
                    meta.Item().AlignRight().Text($"Generated {generatedLocal:MMM d, yyyy h:mm tt} (PH)")
                        .FontSize(7).FontColor(Muted);
                    meta.Item().AlignRight().Text($"By {report.GeneratedBy}")
                        .FontSize(7).FontColor(Muted);
                });
            });
            column.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Teal);
        });
    }

    private static void ComposeFooter(IContainer container, DashboardReportDto report, string docRef)
    {
        container.AlignRight().Text(text =>
        {
            text.Span($"Mori International Hotel · official operations softcopy · {docRef}  ·  ")
                .FontSize(6.5f).FontColor(Teal);
            text.CurrentPageNumber().FontSize(6.5f);
            text.Span(" / ").FontSize(6.5f);
            text.TotalPages().FontSize(6.5f);
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

    /* ---- body ----------------------------------------------------------- */

    private static void ComposeBody(IContainer container, DashboardReportDto report)
    {
        container.Column(column =>
        {
            column.Spacing(10);

            column.Item().Element(kpis => ComposeKpis(kpis, report));

            column.Item().Element(c => ComposeStayTable(
                c,
                "Bookings",
                "Walk-in and online bookings whose stay overlaps the period.",
                report.Bookings,
                "No bookings in this period."));

            column.Item().Element(c => ComposeStayTable(
                c,
                "Reservations",
                "Advance reservations whose stay overlaps the period.",
                report.Reservations,
                "No reservations in this period."));

            column.Item().Element(c => ComposePaymentsTable(c, report.Payments));

            column.Item().Element(c => ComposeAvailabilityTable(c, report));

            column.Item().Element(c => ComposeStatusTable(c, report.AvailabilityByDate));

            // Charts live on a dedicated last page, same as the HTML preview.
            column.Item().PageBreak();
            column.Item().Element(c => ComposeCharts(c, report));
        });
    }

    private static void ComposeCharts(IContainer container, DashboardReportDto report)
    {
        container.Column(column =>
        {
            column.Spacing(12);
            column.Item().Text("Charts").FontSize(10).Bold().FontColor(Navy);
            column.Item().Text(
                    $"Visual summary for {report.RangeLabel} — this is the last page of the report.")
                .FontSize(6.5f).FontColor(Muted);

            ComposeBarChart(
                column,
                "Posted revenue — selected period",
                report.Trend,
                p => p.Revenue,
                p => p.Label,
                v => $"₱{v:N2}");
            ComposeBarChart(
                column,
                "Arrivals — selected period",
                report.Trend,
                p => p.Arrivals,
                p => p.Label,
                v => v.ToString("0"));
            ComposeBarChart(
                column,
                "Booking status mix",
                report.BookingStatusMix,
                s => s.Count,
                s => s.Label,
                v => v.ToString("0"));
            ComposeBarChart(
                column,
                "Room status mix",
                report.RoomStatusMix,
                s => s.Count,
                s => s.Label,
                v => v.ToString("0"));
        });
    }

    private static void ComposeBarChart<T>(
        ColumnDescriptor column,
        string title,
        IReadOnlyList<T> entries,
        Func<T, decimal> value,
        Func<T, string> label,
        Func<decimal, string> display)
    {
        var max = entries.Count == 0 ? 1m : Math.Max(1m, entries.Max(value));

        column.Item().Column(chart =>
        {
            chart.Item().PaddingBottom(2).Text(title).FontSize(8).Bold().FontColor(Navy);
            foreach (var entry in entries)
            {
                var v = value(entry);
                var pct = (float)(v / max * 100);
                var filled = Math.Max(pct, 0.5f);

                chart.Item().PaddingBottom(1.5f).Row(row =>
                {
                    row.ConstantItem(92).AlignMiddle().Text(label(entry)).FontSize(6.5f);
                    row.RelativeItem().AlignMiddle().Row(bar =>
                    {
                        bar.RelativeItem(filled).Background(Teal).Height(7);
                        if (filled < 100)
                        {
                            bar.RelativeItem(100 - filled).Background(HeaderBg).Height(7);
                        }
                    });
                    row.ConstantItem(76).AlignMiddle().AlignRight()
                        .Text(display(v)).FontSize(6.5f).FontColor(Muted);
                });
            }
        });
    }

    private static void ComposeKpis(IContainer container, DashboardReportDto report)
    {
        container.Row(row =>
        {
            Kpi(row, "Bookings", report.BookingCount.ToString());
            Kpi(row, "Reservations", report.ReservationCount.ToString());
            Kpi(row, "Payment records", report.PaymentRecordCount.ToString());
            Kpi(row, "Rooms", report.RoomCount.ToString());
            Kpi(row, "Posted revenue", $"₱{report.RevenuePostedTotal:N2}");
        });
    }

    private static void Kpi(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().PaddingRight(6).Border(0.75f).BorderColor(Line).Padding(6).Column(cell =>
        {
            cell.Item().Text(label.ToUpperInvariant()).FontSize(6).FontColor(Muted);
            cell.Item().Text(value).FontSize(11).Bold().FontColor(Navy);
        });
    }

    private static void SectionTitle(ColumnDescriptor column, string title, string note)
    {
        column.Item().Text(title).FontSize(10).Bold().FontColor(Navy);
        if (!string.IsNullOrWhiteSpace(note))
        {
            column.Item().PaddingBottom(3).Text(note).FontSize(6.5f).FontColor(Muted);
        }
    }

    private static void ComposeStayTable(
        IContainer container,
        string title,
        string note,
        IReadOnlyList<DashboardReportBookingRow> rows,
        string emptyText)
    {
        container.Column(column =>
        {
            SectionTitle(column, title, note);

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(72);   // reference
                    columns.RelativeColumn(1.4f); // guest
                    columns.RelativeColumn(2.2f); // stay
                    columns.RelativeColumn(1.6f); // rooms
                    columns.ConstantColumn(62);   // status
                    columns.RelativeColumn(0.9f); // total
                    columns.RelativeColumn(0.9f); // paid
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderCell).Text("Reference");
                    header.Cell().Element(HeaderCell).Text("Guest");
                    header.Cell().Element(HeaderCell).Text("Stay");
                    header.Cell().Element(HeaderCell).Text("Rooms");
                    header.Cell().Element(HeaderCell).Text("Status");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Total");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Paid");
                });

                if (rows.Count == 0)
                {
                    table.Cell().ColumnSpan(7).Element(EmptyCell).Text(emptyText);
                    return;
                }

                foreach (var b in rows)
                {
                    table.Cell().Element(BodyCell).Text(b.Reference);
                    table.Cell().Element(BodyCell).Text(b.GuestName);
                    table.Cell().Element(BodyCell).Text($"{Fmt(b.CheckInAtUtc)} → {Fmt(b.CheckoutTimeUtc)}");
                    table.Cell().Element(BodyCell).Text(b.Rooms);
                    table.Cell().Element(BodyCell).Text(b.Status);
                    table.Cell().Element(BodyCell).AlignRight().Text($"₱{b.TotalAmount:N2}");
                    table.Cell().Element(BodyCell).AlignRight().Text($"₱{b.PaidTotal:N2}");
                }
            });
        });
    }

    private static void ComposePaymentsTable(
        IContainer container,
        IReadOnlyList<DashboardReportPaymentRow> rows)
    {
        container.Column(column =>
        {
            SectionTitle(
                column,
                "Payment records",
                "Append-only payment ledger posted in the period — latest 500 events.");

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(88);   // receipt
                    columns.ConstantColumn(70);   // booking
                    columns.ConstantColumn(72);   // event
                    columns.ConstantColumn(56);   // method
                    columns.RelativeColumn(0.9f); // amount
                    columns.ConstantColumn(52);   // status
                    columns.RelativeColumn(1.4f); // posted at
                    columns.RelativeColumn(1.2f); // received by
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderCell).Text("Receipt");
                    header.Cell().Element(HeaderCell).Text("Booking");
                    header.Cell().Element(HeaderCell).Text("Event");
                    header.Cell().Element(HeaderCell).Text("Method");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Amount");
                    header.Cell().Element(HeaderCell).Text("Status");
                    header.Cell().Element(HeaderCell).Text("Posted at");
                    header.Cell().Element(HeaderCell).Text("Received by");
                });

                if (rows.Count == 0)
                {
                    table.Cell().ColumnSpan(8).Element(EmptyCell).Text("No payment records in this period.");
                    return;
                }

                foreach (var p in rows)
                {
                    table.Cell().Element(BodyCell).Text(p.ReceiptNumber);
                    table.Cell().Element(BodyCell).Text(p.BookingReference);
                    table.Cell().Element(BodyCell).Text(p.EventType);
                    table.Cell().Element(BodyCell).Text(p.Method);
                    table.Cell().Element(BodyCell).AlignRight().Text($"₱{p.Amount:N2}");
                    table.Cell().Element(BodyCell).Text(p.Status);
                    table.Cell().Element(BodyCell).Text(Fmt(p.PaidAtUtc));
                    table.Cell().Element(BodyCell).Text(p.ReceivedBy);
                }
            });
        });
    }

    private static void ComposeAvailabilityTable(IContainer container, DashboardReportDto report)
    {
        var note = report.AvailabilityTruncated
            ? "Rooms booked per type for each date — pending and confirmed stays deduct inventory. Showing the first 93 days of the range."
            : "Rooms booked per type for each date — pending and confirmed stays deduct inventory. Housekeeping doors are removed from Available.";

        container.Column(column =>
        {
            SectionTitle(column, "Room availability by type", note);

            column.Item().Table(table =>
            {
                var typeCount = report.RoomTypeColumns.Count;
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(64); // date
                    for (var t = 0; t < typeCount; t++)
                    {
                        columns.RelativeColumn(1);
                    }
                    columns.RelativeColumn(0.8f); // occupied
                    columns.RelativeColumn(0.8f); // available
                    columns.ConstantColumn(38);   // occ %
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderCell).Text("Date");
                    foreach (var c in report.RoomTypeColumns)
                    {
                        header.Cell().Element(HeaderCell).AlignRight().Text($"{c.Name} ({c.Total})");
                    }
                    header.Cell().Element(HeaderCell).AlignRight().Text("Occupied");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Available");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Occ %");
                });

                if (report.AvailabilityByDate.Count == 0)
                {
                    table.Cell().ColumnSpan((uint)(typeCount + 4)).Element(EmptyCell).Text("No rooms configured.");
                    return;
                }

                foreach (var r in report.AvailabilityByDate)
                {
                    table.Cell().Element(BodyCell).Text(r.DateLabel);
                    foreach (var n in r.BookedByType)
                    {
                        table.Cell().Element(BodyCell).AlignRight().Text(n.ToString());
                    }
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Occupied.ToString()).Bold();
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Available.ToString());
                    table.Cell().Element(BodyCell).AlignRight().Text($"{r.OccupancyPercent}%");
                }
            });
        });
    }

    private static void ComposeStatusTable(
        IContainer container,
        IReadOnlyList<DashboardReportAvailabilityRow> rows)
    {
        container.Column(column =>
        {
            SectionTitle(
                column,
                "Room status by date",
                "House position per date: rooms held by bookings (Occupied), doors open to sell (Available), and current housekeeping flags applied flat (Cleaning / Unavailable).");

            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.ConstantColumn(64);
                    for (var i = 0; i < 5; i++)
                    {
                        columns.RelativeColumn(1);
                    }
                });

                table.Header(header =>
                {
                    header.Cell().Element(HeaderCell).Text("Date");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Occupied");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Available");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Cleaning");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Unavailable");
                    header.Cell().Element(HeaderCell).AlignRight().Text("Occ %");
                });

                if (rows.Count == 0)
                {
                    table.Cell().ColumnSpan(6).Element(EmptyCell).Text("No rooms configured.");
                    return;
                }

                foreach (var r in rows)
                {
                    table.Cell().Element(BodyCell).Text(r.DateLabel);
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Occupied.ToString()).Bold();
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Available.ToString());
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Cleaning.ToString());
                    table.Cell().Element(BodyCell).AlignRight().Text(r.Unavailable.ToString());
                    table.Cell().Element(BodyCell).AlignRight().Text($"{r.OccupancyPercent}%");
                }
            });
        });
    }

    /* ---- shared cell helpers -------------------------------------------- */

    private static IContainer HeaderCell(IContainer container) =>
        container
            .BorderBottom(1)
            .BorderColor(Teal)
            .Background(HeaderBg)
            .PaddingVertical(3.5f)
            .PaddingHorizontal(3)
            .DefaultTextStyle(text => text.Bold().FontSize(6.5f).FontColor(Navy));

    private static IContainer BodyCell(IContainer container) =>
        container
            .BorderBottom(0.5f)
            .BorderColor(Line)
            .PaddingVertical(2.5f)
            .PaddingHorizontal(3)
            .DefaultTextStyle(text => text.FontSize(6.8f).FontColor(Navy));

    private static IContainer EmptyCell(IContainer cell) =>
        cell.Padding(8);

    private static string Fmt(DateTime utc) =>
        PhilippinesTime.ToManila(utc).ToString("MMM d, yyyy h:mm tt");
}
