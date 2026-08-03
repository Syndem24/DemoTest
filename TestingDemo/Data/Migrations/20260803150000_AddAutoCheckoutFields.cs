using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAutoCheckoutFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<TimeOnly>(
                name: "CheckOutTime",
                table: "Booking",
                type: "time",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CheckoutWarningSentAtUtc",
                table: "Booking",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "AutoCheckedOutAtUtc",
                table: "Booking",
                type: "datetime2",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CheckOutTime",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "CheckoutWarningSentAtUtc",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "AutoCheckedOutAtUtc",
                table: "Booking");
        }
    }
}
