using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameIsAvailableToStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "Room",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Available");

            migrationBuilder.Sql(
                """
                UPDATE [Room]
                SET [Status] = CASE WHEN [IsAvailable] = 1 THEN N'Available' ELSE N'Unavailable' END;
                """);

            migrationBuilder.DropColumn(
                name: "IsAvailable",
                table: "Room");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsAvailable",
                table: "Room",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.Sql(
                """
                UPDATE [Room]
                SET [IsAvailable] = CASE WHEN [Status] = N'Available' THEN 1 ELSE 0 END;
                """);

            migrationBuilder.DropColumn(
                name: "Status",
                table: "Room");
        }
    }
}
