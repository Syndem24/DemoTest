using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AllowNullBookingItemRoomTypeId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.DropIndex(
                name: "IX_BookingItem_BookingId_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.AlterColumn<int>(
                name: "RoomTypeId",
                table: "BookingItem",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.CreateIndex(
                name: "IX_BookingItem_BookingId_RoomTypeId",
                table: "BookingItem",
                columns: new[] { "BookingId", "RoomTypeId" },
                unique: true,
                filter: "[RoomTypeId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem",
                column: "RoomTypeId",
                principalTable: "RoomType",
                principalColumn: "RoomTypeID",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.DropIndex(
                name: "IX_BookingItem_BookingId_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.AlterColumn<int>(
                name: "RoomTypeId",
                table: "BookingItem",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookingItem_BookingId_RoomTypeId",
                table: "BookingItem",
                columns: new[] { "BookingId", "RoomTypeId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem",
                column: "RoomTypeId",
                principalTable: "RoomType",
                principalColumn: "RoomTypeID",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
