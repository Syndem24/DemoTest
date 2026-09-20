using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class BookingListCreatedIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Booking_List_Created' AND object_id = OBJECT_ID(N'dbo.Booking'))
                    CREATE INDEX [IX_Booking_List_Created] ON [dbo].[Booking] ([IsArchived], [Status], [CreatedAtUtc] DESC, [Id] DESC);
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Booking_List_Created' AND object_id = OBJECT_ID(N'dbo.Booking'))
                    DROP INDEX [IX_Booking_List_Created] ON [dbo].[Booking];
                """);
        }
    }
}
