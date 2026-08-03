using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingRoomAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BookingRoomAssignment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    BookingLineId = table.Column<int>(type: "int", nullable: false),
                    RoomId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BookingRoomAssignment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BookingRoomAssignment_BookingLine_BookingLineId",
                        column: x => x.BookingLineId,
                        principalTable: "BookingLine",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_BookingRoomAssignment_Room_RoomId",
                        column: x => x.RoomId,
                        principalTable: "Room",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BookingRoomAssignment_BookingLineId_RoomId",
                table: "BookingRoomAssignment",
                columns: new[] { "BookingLineId", "RoomId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BookingRoomAssignment_RoomId",
                table: "BookingRoomAssignment",
                column: "RoomId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BookingRoomAssignment");
        }
    }
}
