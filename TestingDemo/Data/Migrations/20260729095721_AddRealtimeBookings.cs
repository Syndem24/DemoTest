using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddRealtimeBookings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[Booking]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.Booking', N'Reference') IS NULL
                BEGIN
                    IF OBJECT_ID(N'[dbo].[LegacyBooking]', N'U') IS NULL
                    BEGIN
                        EXEC sp_rename N'[dbo].[Booking]', N'LegacyBooking';
                        IF OBJECT_ID(N'[dbo].[PK_Booking]', N'PK') IS NOT NULL
                            EXEC sp_rename N'[dbo].[PK_Booking]', N'PK_LegacyBooking', N'OBJECT';
                    END
                END
                """);

            migrationBuilder.CreateTable(
                name: "Booking",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Reference = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    GuestName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    GuestEmail = table.Column<string>(type: "nvarchar(254)", maxLength: 254, nullable: false),
                    GuestPhone = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CheckIn = table.Column<DateOnly>(type: "date", nullable: false),
                    CheckOut = table.Column<DateOnly>(type: "date", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TotalAmount = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    AdminReadAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Booking", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StaffUser",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Username = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffUser", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BookingLine",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookingId = table.Column<int>(type: "int", nullable: false),
                    RoomTypeId = table.Column<int>(type: "int", nullable: false),
                    RoomTypeName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    PricePerNight = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookingLine", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BookingLine_Booking_BookingId",
                        column: x => x.BookingId,
                        principalTable: "Booking",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BookingLine_RoomType_RoomTypeId",
                        column: x => x.RoomTypeId,
                        principalTable: "RoomType",
                        principalColumn: "RoomTypeID",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Booking_CreatedAtUtc",
                table: "Booking",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Booking_Reference",
                table: "Booking",
                column: "Reference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Booking_Status_CheckIn_CheckOut",
                table: "Booking",
                columns: new[] { "Status", "CheckIn", "CheckOut" });

            migrationBuilder.CreateIndex(
                name: "IX_BookingLine_BookingId_RoomTypeId",
                table: "BookingLine",
                columns: new[] { "BookingId", "RoomTypeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookingLine_RoomTypeId",
                table: "BookingLine",
                column: "RoomTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffUser_Username",
                table: "StaffUser",
                column: "Username",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookingLine");

            migrationBuilder.DropTable(
                name: "StaffUser");

            migrationBuilder.DropTable(
                name: "Booking");

            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[LegacyBooking]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[Booking]', N'U') IS NULL
                BEGIN
                    EXEC sp_rename N'[dbo].[LegacyBooking]', N'Booking';
                    IF OBJECT_ID(N'[dbo].[PK_LegacyBooking]', N'PK') IS NOT NULL
                        EXEC sp_rename N'[dbo].[PK_LegacyBooking]', N'PK_Booking', N'OBJECT';
                END
                """);
        }
    }
}
