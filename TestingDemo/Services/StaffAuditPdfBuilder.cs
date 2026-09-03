using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>Branded PDF of staff account audit rows from <see cref="SystemAuditLog"/>.</summary>
public static class StaffAuditPdfBuilder
{
    private static readonly Color Navy = Color.FromHex("#0B1F33");
    private static readonly Color Teal = Color.FromHex("#1AA6A6");
    private static readonly Color Line = Color.FromHex("#C5D0DA");
    private static readonly Color HeaderBg = Color.FromHex("#E8F4F4");

    public static byte[] Build(
        IReadOnlyList<SystemAuditLog> rows,
        string performedBy,
        DateTime flushedAtUtc,
        string? logoPath)
    {
        var flushedLocal = PhilippinesTime.ToManila(flushedAtUtc);
        var ordered = rows.OrderByDescending(row => row.AtUtc).ThenByDescending(row => row.Id).ToList();

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(28);
                page.MarginVertical(22);
                page.DefaultTextStyle(text => text.FontSize(8).FontColor(Navy));

                page.Header().Element(header => ComposeHeader(header, logoPath, flushedLocal, performedBy, ordered.Count));
                page.Content().Element(content => ComposeTable(content, ordered));
                page.Footer().AlignRight().Text(text =>
                {
                    text.Span("Mori International Hotel · staff audit export  ·  ").FontSize(7).FontColor(Teal);
                    text.CurrentPageNumber().FontSize(7);
                    text.Span(" / ").FontSize(7);
                    text.TotalPages().FontSize(7);
                });
            });
        }).GeneratePdf();
    }

    private static void ComposeHeader(
        IContainer container,
        string? logoPath,
        DateTime flushedLocal,
        string performedBy,
        int count)
    {
        container.PaddingBottom(8).Column(column =>
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
                    brand.Item().Text("MORI INTERNATIONAL HOTEL — Staff audit log")
                        .FontSize(11).Bold().FontColor(Navy);
                    brand.Item().Text("Account create / edit / disable actions · exported from system audit")
                        .FontSize(7).FontColor(Teal);
                });
            });
            column.Item().PaddingTop(4).LineHorizontal(1.5f).LineColor(Teal);
            column.Item().PaddingTop(4).Text(
                    $"Exported: {flushedLocal:MMM d, yyyy h:mm tt} (PH)  ·  By: {performedBy}  ·  {count} row{(count == 1 ? "" : "s")}")
                .FontSize(7);
        });
    }

    private static void ComposeTable(IContainer container, IReadOnlyList<SystemAuditLog> rows)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(1.4f);
                columns.RelativeColumn(1.2f);
                columns.RelativeColumn(1.6f);
                columns.RelativeColumn(1.6f);
                columns.RelativeColumn(1.6f);
            });

            table.Header(header =>
            {
                foreach (var title in new[] { "When (PH)", "Action", "Summary", "Target", "Actor" })
                {
                    header.Cell().Background(HeaderBg).BorderBottom(1).BorderColor(Line)
                        .Padding(5).Text(title).SemiBold().FontSize(7);
                }
            });

            foreach (var row in rows)
            {
                var when = PhilippinesTime.ToManila(row.AtUtc).ToString("dd MMM yyyy HH:mm");
                var action = StaffAccountActivityMapper.NormalizeActionKey(row.Action);
                table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(5).Text(when).FontSize(7);
                table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(5).Text(action).FontSize(7);
                table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(5).Text(row.Summary).FontSize(7);
                table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(5).Text(row.TargetLabel).FontSize(7);
                table.Cell().BorderBottom(0.5f).BorderColor(Line).Padding(5).Text(row.ActorDisplayName).FontSize(7);
            }
        });
    }
}
