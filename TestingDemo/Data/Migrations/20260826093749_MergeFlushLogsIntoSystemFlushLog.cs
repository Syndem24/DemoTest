using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class MergeFlushLogsIntoSystemFlushLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SystemFlushLog",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FlushedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PerformedBy = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RecordCount = table.Column<int>(type: "int", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SystemFlushLog", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SystemFlushLog_FlushedAtUtc",
                table: "SystemFlushLog",
                column: "FlushedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_SystemFlushLog_Kind_FlushedAtUtc",
                table: "SystemFlushLog",
                columns: new[] { "Kind", "FlushedAtUtc" });

            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[BookingHistoryFlushLog]', N'U') IS NOT NULL
                INSERT INTO [dbo].[SystemFlushLog] ([Kind], [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                SELECT N'BookingHistory', [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary]
                FROM [dbo].[BookingHistoryFlushLog];

                IF OBJECT_ID(N'[dbo].[PaymentFlushLog]', N'U') IS NOT NULL
                INSERT INTO [dbo].[SystemFlushLog] ([Kind], [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                SELECT N'Payments', [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary]
                FROM [dbo].[PaymentFlushLog];

                IF OBJECT_ID(N'[dbo].[BookingHistoryFlushLog]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[BookingHistoryFlushLog];

                IF OBJECT_ID(N'[dbo].[PaymentFlushLog]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[PaymentFlushLog];
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BookingHistoryFlushLog",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FlushedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PerformedBy = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RecordCount = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookingHistoryFlushLog", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentFlushLog",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FileName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FlushedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    PerformedBy = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    RecordCount = table.Column<int>(type: "int", nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentFlushLog", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookingHistoryFlushLog_FlushedAtUtc",
                table: "BookingHistoryFlushLog",
                column: "FlushedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentFlushLog_FlushedAtUtc",
                table: "PaymentFlushLog",
                column: "FlushedAtUtc");

            migrationBuilder.Sql(
                """
                INSERT INTO [dbo].[BookingHistoryFlushLog] ([FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                SELECT [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary]
                FROM [dbo].[SystemFlushLog]
                WHERE [Kind] = N'BookingHistory';

                INSERT INTO [dbo].[PaymentFlushLog] ([FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                SELECT [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary]
                FROM [dbo].[SystemFlushLog]
                WHERE [Kind] = N'Payments';
                """);

            migrationBuilder.DropTable(
                name: "SystemFlushLog");
        }
    }
}
