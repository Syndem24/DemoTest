using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSpecialOffersAndBookingPromoFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ArrivalDiscountRequest",
                table: "Booking",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<bool>(
                name: "CashOnlyPromo",
                table: "Booking",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Channel",
                table: "Booking",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Online");

            migrationBuilder.AddColumn<int>(
                name: "SpecialOfferId",
                table: "Booking",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SpecialOffer",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    RoomTypeId = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    RegularPricePerNight = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    PromoPricePerNight = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    MinNights = table.Column<int>(type: "int", nullable: true),
                    Channels = table.Column<int>(type: "int", nullable: false),
                    CashOnly = table.Column<bool>(type: "bit", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    StartsAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndsAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpecialOffer", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpecialOffer_RoomType_RoomTypeId",
                        column: x => x.RoomTypeId,
                        principalTable: "RoomType",
                        principalColumn: "RoomTypeID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Booking_SpecialOfferId",
                table: "Booking",
                column: "SpecialOfferId");

            migrationBuilder.CreateIndex(
                name: "IX_SpecialOffer_RoomTypeId_IsActive_StartsAtUtc_EndsAtUtc",
                table: "SpecialOffer",
                columns: new[] { "RoomTypeId", "IsActive", "StartsAtUtc", "EndsAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_SpecialOffer_SortOrder",
                table: "SpecialOffer",
                column: "SortOrder");

            migrationBuilder.AddForeignKey(
                name: "FK_Booking_SpecialOffer_SpecialOfferId",
                table: "Booking",
                column: "SpecialOfferId",
                principalTable: "SpecialOffer",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Booking_SpecialOffer_SpecialOfferId",
                table: "Booking");

            migrationBuilder.DropTable(
                name: "SpecialOffer");

            migrationBuilder.DropIndex(
                name: "IX_Booking_SpecialOfferId",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "ArrivalDiscountRequest",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "CashOnlyPromo",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "Channel",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "SpecialOfferId",
                table: "Booking");
        }
    }
}
