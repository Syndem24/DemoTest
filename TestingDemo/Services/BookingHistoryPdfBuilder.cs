using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Builds a branded softcopy PDF of archived booking history for official record export.
/// Detail rows stay on data pages; totals live on a dedicated last summary page.
/// </summary>
public static class BookingHistoryPdfBuilder
{
    private static readonly Color Navy = Color.FromHex("#0B1F33");
    private static readonly Color Teal = Color.FromHex("#1AA6A6");
    private static readonly Color Line = Color.FromHex("#C5D0DA");
    private static readonly Color HeaderBg = Color.FromHex("#E8F4F4");

    public static byte[] Build(
        IReadOnlyList<Booking> bookings,
        string performedBy,
        DateTime flushedAtUtc,
        string? logoPath)
    {
        var flushedLocal = PhilippinesTime.ToManila(flushedAtUtc);
        var rows = bookings
            .OrderByDescending(b => b.ArchivedAtUtc ?? b.UpdatedAtUtc)
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
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Official History Softcopy")
                        .FontSize(11).Bold().FontColor(Navy);
                    brand.Item().Text("Trademark & proprietary record · detail table (summary on last page)")
                        .FontSize(7).Italic().FontColor(Teal);
                });
            });

            column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Teal);
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
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — History Export Summary")
                        .FontSize(11).Bold().FontColor(Navy);
                    brand.Item().Text("Trademark & proprietary record · totals only (separate from detail pages)")
                        .FontSize(7).Italic().FontColor(Teal);
                });
            });

            column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Teal);
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

    private static void ComposeTable(IContainer container, IReadOnlyList<Booking> bookings)
    {
        if (bookings.Count == 0)
        {
            container.Text("No archived history records.");
            return;
        }

        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.ConstantColumn(72);
                columns.RelativeColumn(1.3f);
                columns.RelativeColumn(1.4f);
                columns.RelativeColumn(1.3f);
                columns.RelativeColumn(1.6f);
                columns.ConstantColumn(52);
                columns.ConstantColumn(48);
                columns.ConstantColumn(54);
                columns.ConstantColumn(58);
            });

            table.Header(header =>
            {
                header.Cell().Element(HeaderCell).Text("Reference");
                header.Cell().Element(HeaderCell).Text("Guest");
                header.Cell().Element(HeaderCell).Text("Contact");
                header.Cell().Element(HeaderCell).Text("Stay (PH)");
                header.Cell().Element(HeaderCell).Text("Rooms");
                header.Cell().Element(HeaderCell).Text("Kind");
                header.Cell().Element(HeaderCell).Text("Pay");
                header.Cell().Element(HeaderCell).Text("Status");
                header.Cell().Element(HeaderCell).AlignRight().Text("Total");
            });

            var alt = false;
            foreach (var booking in bookings)
            {
                var bg = alt ? Color.FromHex("#F7FAFC") : Colors.White;
                alt = !alt;

                table.Cell().Element(c => BodyCell(c, bg)).Text(booking.Reference).Bold();
                table.Cell().Element(c => BodyCell(c, bg)).Text(booking.GuestName);
                table.Cell().Element(c => BodyCell(c, bg)).Text($"{booking.GuestEmail}\n{booking.GuestPhone}");
                table.Cell().Element(c => BodyCell(c, bg)).Text(FormatStay(booking));
                table.Cell().Element(c => BodyCell(c, bg)).Text(FormatRooms(booking));
                table.Cell().Element(c => BodyCell(c, bg)).Text(booking.Kind.ToString());
                table.Cell().Element(c => BodyCell(c, bg)).Text(booking.PaymentOption.ToString());
                table.Cell().Element(c => BodyCell(c, bg)).Text(FormatStatus(booking.Status));
                table.Cell().Element(c => BodyCell(c, bg)).AlignRight().Text($"₱{booking.TotalAmount:N2}");
            }
        });
    }

    private static void ComposeSummary(
        IContainer container,
        IReadOnlyList<Booking> bookings,
        DateTime flushedLocal,
        string performedBy)
    {
        if (bookings.Count == 0)
        {
            container.Text("No history records were exported.");
            return;
        }

        var checkedOut = bookings.Count(b => b.Status == BookingStatus.CheckedOut);
        var cancelled = bookings.Count(b => b.Status == BookingStatus.Cancelled);
        var rejected = bookings.Count(b => b.Status == BookingStatus.Rejected);
        var other = bookings.Count - checkedOut - cancelled - rejected;
        var bookingKind = bookings.Count(b => b.Kind == BookingKind.Booking);
        var reservationKind = bookings.Count(b => b.Kind == BookingKind.Reservation);
        var totalValue = bookings.Sum(b => b.TotalAmount);
        var stayStart = PhilippinesTime.ToManila(bookings.Min(b => b.CheckInAtUtc));
        var stayEnd = PhilippinesTime.ToManila(bookings.Max(b => b.CheckoutTimeUtc));
        var roomQty = bookings.SelectMany(b => b.Items).Sum(i => i.Quantity);
        var roomTypes = bookings
            .SelectMany(b => b.Items)
            .GroupBy(i => i.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Sum(i => i.Quantity))
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => (Name: g.Key, Qty: g.Sum(i => i.Quantity)))
            .ToList();
        var payOptions = bookings
            .GroupBy(b => b.PaymentOption.ToString())
            .OrderByDescending(g => g.Count())
            .Select(g => (Name: g.Key, Count: g.Count()))
            .ToList();

        container.Column(column =>
        {
            column.Item().Text("Export totals").FontSize(14).Bold().FontColor(Navy);
            column.Item().PaddingTop(4).Text(
                    "This page summarizes the exported history only. Detail guest/stay rows are on the previous page(s).")
                .FontSize(8).FontColor(Teal);

            column.Item().PaddingTop(14).Element(box =>
            {
                box.Border(1).BorderColor(Teal).Background(HeaderBg).Padding(12).Column(stats =>
                {
                    stats.Item().Text($"Total records exported: {bookings.Count}").FontSize(12).Bold();
                    stats.Item().PaddingTop(6).Text($"Total stay value: ₱{totalValue:N2}").FontSize(11).Bold();
                    stats.Item().PaddingTop(4).Text($"Total room assignments (qty): {roomQty}").FontSize(10);
                    stats.Item().PaddingTop(4).Text(
                            $"Stay date range (PH): {stayStart:MMM d, yyyy} – {stayEnd:MMM d, yyyy}")
                        .FontSize(10);
                    stats.Item().PaddingTop(4).Text(
                            $"Exported by: {performedBy}  ·  {flushedLocal:MMM d, yyyy h:mm tt} (PH)")
                        .FontSize(9);
                });
            });

            column.Item().PaddingTop(16).Row(row =>
            {
                row.RelativeItem().PaddingRight(8).Element(c => ComposeSummaryBlock(
                    c,
                    "By status",
                    [
                        ("Checked out", checkedOut),
                        ("Cancelled", cancelled),
                        ("Rejected", rejected),
                        ("Other", other),
                    ]));
                row.RelativeItem().PaddingHorizontal(4).Element(c => ComposeSummaryBlock(
                    c,
                    "By kind",
                    [
                        ("Booking", bookingKind),
                        ("Reservation", reservationKind),
                    ]));
                row.RelativeItem().PaddingLeft(8).Element(c => ComposeSummaryBlock(
                    c,
                    "By payment option",
                    payOptions.Select(p => (p.Name, p.Count)).ToList()));
            });

            if (roomTypes.Count > 0)
            {
                column.Item().PaddingTop(16).Element(c => ComposeSummaryBlock(
                    c,
                    "By room type (quantity)",
                    roomTypes.Select(r => (r.Name, r.Qty)).ToList()));
            }
        });
    }

    private static void ComposeSummaryBlock(
        IContainer container,
        string title,
        IReadOnlyList<(string Label, int Count)> rows)
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

                foreach (var (label, count) in rows.Where(r => r.Count > 0 || rows.Count <= 4))
                {
                    table.Cell().PaddingVertical(2).Text(label).FontSize(9);
                    table.Cell().PaddingVertical(2).AlignRight().Text(count.ToString("N0")).FontSize(9).Bold();
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
            .DefaultTextStyle(text => text.Bold().FontSize(7).FontColor(Navy));
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

    private static string FormatStay(Booking booking)
    {
        var checkIn = PhilippinesTime.ToManila(booking.CheckInAtUtc);
        var checkOut = PhilippinesTime.ToManila(booking.CheckoutTimeUtc);
        return $"{checkIn:MMM d yyyy HH:mm} → {checkOut:MMM d yyyy HH:mm}";
    }

    private static string FormatRooms(Booking booking)
    {
        var parts = booking.Items
            .OrderBy(i => i.RoomTypeName, StringComparer.OrdinalIgnoreCase)
            .Select(item =>
            {
                var rooms = (item.AssignedRooms ?? Array.Empty<AssignedRoom>())
                    .Select(a => a.Room?.RoomNumber)
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var roomPart = rooms.Count > 0 ? string.Join(", ", rooms) : "—";
                return $"{item.Quantity}× {item.RoomTypeName}: {roomPart}";
            });
        return string.Join("; ", parts);
    }

    private static string FormatStatus(BookingStatus status)
    {
        return status == BookingStatus.CheckedOut ? "Checked out" : status.ToString();
    }

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
                text.Span("  ·  Official trademark softcopy").FontSize(6.5f).FontColor(Teal);
            });
        });
    }
}
