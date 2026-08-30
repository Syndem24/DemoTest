using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameAssignedRoomToBookingRoomAssignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Room_RoomType_RoomTypeID",
                table: "Room");

            migrationBuilder.DropForeignKey(
                name: "FK_AssignedRoom_BookingItem_BookingItemId",
                table: "AssignedRoom");

            migrationBuilder.DropForeignKey(
                name: "FK_AssignedRoom_Room_RoomId",
                table: "AssignedRoom");

            migrationBuilder.RenameColumn(
                name: "RoomTypeID",
                table: "RoomType",
                newName: "RoomTypeId");

            migrationBuilder.RenameColumn(
                name: "RoomTypeID",
                table: "Room",
                newName: "RoomTypeId");

            migrationBuilder.RenameIndex(
                name: "IX_Room_RoomTypeID",
                table: "Room",
                newName: "IX_Room_RoomTypeId");

            migrationBuilder.RenameTable(
                name: "AssignedRoom",
                newName: "BookingRoomAssignment");

            migrationBuilder.Sql("""
                IF OBJECT_ID(N'[PK_AssignedRoom]', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_AssignedRoom', N'PK_BookingRoomAssignment', N'OBJECT';
                """);

            migrationBuilder.RenameIndex(
                name: "IX_AssignedRoom_BookingItemId_RoomId",
                table: "BookingRoomAssignment",
                newName: "IX_BookingRoomAssignment_BookingItemId_RoomId");

            migrationBuilder.RenameIndex(
                name: "IX_AssignedRoom_RoomId",
                table: "BookingRoomAssignment",
                newName: "IX_BookingRoomAssignment_RoomId");

            migrationBuilder.AddForeignKey(
                name: "FK_Room_RoomType_RoomTypeId",
                table: "Room",
                column: "RoomTypeId",
                principalTable: "RoomType",
                principalColumn: "RoomTypeId",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingRoomAssignment_BookingItem_BookingItemId",
                table: "BookingRoomAssignment",
                column: "BookingItemId",
                principalTable: "BookingItem",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingRoomAssignment_Room_RoomId",
                table: "BookingRoomAssignment",
                column: "RoomId",
                principalTable: "Room",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Room_RoomType_RoomTypeId",
                table: "Room");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingRoomAssignment_BookingItem_BookingItemId",
                table: "BookingRoomAssignment");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingRoomAssignment_Room_RoomId",
                table: "BookingRoomAssignment");

            migrationBuilder.RenameIndex(
                name: "IX_BookingRoomAssignment_BookingItemId_RoomId",
                table: "BookingRoomAssignment",
                newName: "IX_AssignedRoom_BookingItemId_RoomId");

            migrationBuilder.RenameIndex(
                name: "IX_BookingRoomAssignment_RoomId",
                table: "BookingRoomAssignment",
                newName: "IX_AssignedRoom_RoomId");

            migrationBuilder.RenameTable(
                name: "BookingRoomAssignment",
                newName: "AssignedRoom");

            migrationBuilder.Sql("""
                IF OBJECT_ID(N'[PK_BookingRoomAssignment]', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_BookingRoomAssignment', N'PK_AssignedRoom', N'OBJECT';
                """);

            migrationBuilder.RenameColumn(
                name: "RoomTypeId",
                table: "RoomType",
                newName: "RoomTypeID");

            migrationBuilder.RenameColumn(
                name: "RoomTypeId",
                table: "Room",
                newName: "RoomTypeID");

            migrationBuilder.RenameIndex(
                name: "IX_Room_RoomTypeId",
                table: "Room",
                newName: "IX_Room_RoomTypeID");

            migrationBuilder.AddForeignKey(
                name: "FK_Room_RoomType_RoomTypeID",
                table: "Room",
                column: "RoomTypeID",
                principalTable: "RoomType",
                principalColumn: "RoomTypeID",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_AssignedRoom_BookingItem_BookingItemId",
                table: "AssignedRoom",
                column: "BookingItemId",
                principalTable: "BookingItem",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AssignedRoom_Room_RoomId",
                table: "AssignedRoom",
                column: "RoomId",
                principalTable: "Room",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
