using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260905120000_AddBookingGuestHeadCount")]
    public partial class AddBookingGuestHeadCount : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.Booking', N'AdultCount') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [AdultCount] int NOT NULL CONSTRAINT [DF_Booking_AdultCount] DEFAULT (0);
                IF COL_LENGTH(N'dbo.Booking', N'ChildCount') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [ChildCount] int NOT NULL CONSTRAINT [DF_Booking_ChildCount] DEFAULT (0);
                IF COL_LENGTH(N'dbo.Booking', N'GuestPartyJson') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [GuestPartyJson] nvarchar(4000) NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.Booking', N'GuestPartyJson') IS NOT NULL
                    ALTER TABLE [dbo].[Booking] DROP COLUMN [GuestPartyJson];
                IF COL_LENGTH(N'dbo.Booking', N'ChildCount') IS NOT NULL
                BEGIN
                    DECLARE @dfChild sysname =
                        (SELECT dc.name FROM sys.default_constraints dc
                         INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
                         WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Booking') AND c.name = N'ChildCount');
                    IF @dfChild IS NOT NULL EXEC(N'ALTER TABLE [dbo].[Booking] DROP CONSTRAINT [' + @dfChild + N']');
                    ALTER TABLE [dbo].[Booking] DROP COLUMN [ChildCount];
                END
                IF COL_LENGTH(N'dbo.Booking', N'AdultCount') IS NOT NULL
                BEGIN
                    DECLARE @dfAdult sysname =
                        (SELECT dc.name FROM sys.default_constraints dc
                         INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
                         WHERE dc.parent_object_id = OBJECT_ID(N'dbo.Booking') AND c.name = N'AdultCount');
                    IF @dfAdult IS NOT NULL EXEC(N'ALTER TABLE [dbo].[Booking] DROP CONSTRAINT [' + @dfAdult + N']');
                    ALTER TABLE [dbo].[Booking] DROP COLUMN [AdultCount];
                END
                """);
        }
    }
}
