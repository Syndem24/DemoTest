using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Booking_Status_CheckIn_CheckOut",
                table: "Booking");

            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAtUtc",
                table: "Booking",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "Booking",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.Sql(
                """
                UPDATE [Booking]
                SET [IsArchived] = 1,
                    [ArchivedAtUtc] = [UpdatedAtUtc]
                WHERE [Status] = N'Rejected';
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Booking_IsArchived_Status_CheckIn_CheckOut",
                table: "Booking",
                columns: new[] { "IsArchived", "Status", "CheckIn", "CheckOut" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Booking_IsArchived_Status_CheckIn_CheckOut",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "ArchivedAtUtc",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "Booking");

            migrationBuilder.CreateIndex(
                name: "IX_Booking_Status_CheckIn_CheckOut",
                table: "Booking",
                columns: new[] { "Status", "CheckIn", "CheckOut" });
        }
    }
}
