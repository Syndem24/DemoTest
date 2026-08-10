using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Builds a branded softcopy PDF of archived booking history for official record export.
/// Uses a compact table layout to save pages/paper.
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
        var recordCount = bookings.Count;
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

                page.Header().Element(header => ComposeHeader(header, logoPath, flushedLocal, performedBy, recordCount));
                page.Content().Element(content => ComposeTable(content, rows));
                page.Footer().Element(ComposeFooter);
            });
        }).GeneratePdf();
    }

    private static void ComposeHeader(
        IContainer container,
        string? logoPath,
        DateTime flushedLocal,
        string performedBy,
        int recordCount)
    {
        container.PaddingBottom(6).Column(column =>
        {
            column.Item().Row(row =>
            {
                row.ConstantItem(36).Height(36).Element(logo =>
                {
                    if (!string.IsNullOrWhiteSpace(logoPath) && File.Exists(logoPath))
                    {
                        logo.Image(logoPath).FitArea();
                    }
                    else
                    {
                        logo.Background(Teal);
                    }
                });

                row.RelativeItem().PaddingLeft(8).AlignMiddle().Column(brand =>
                {
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Official History Softcopy")
                        .FontSize(11).Bold().FontColor(Navy);
                    brand.Item().Text("Trademark & proprietary record · compact table archive")
                        .FontSize(7).Italic().FontColor(Teal);
                });
            });

            column.Item().PaddingTop(4).LineHorizontal(1).LineColor(Teal);
            column.Item().PaddingTop(4).Text(
                    $"Flushed: {flushedLocal:MMM d, yyyy h:mm tt} (PH)  ·  By: {performedBy}  ·  Records: {recordCount}  ·  Softcopy prior to permanent deletion")
                .FontSize(7);
        });
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
                columns.ConstantColumn(72);  // Reference
                columns.RelativeColumn(1.3f); // Guest
                columns.RelativeColumn(1.4f); // Contact
                columns.RelativeColumn(1.3f); // Stay
                columns.RelativeColumn(1.6f); // Rooms
                columns.ConstantColumn(52);  // Kind
                columns.ConstantColumn(48);  // Pay
                columns.ConstantColumn(54);  // Status
                columns.ConstantColumn(58);  // Total
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
