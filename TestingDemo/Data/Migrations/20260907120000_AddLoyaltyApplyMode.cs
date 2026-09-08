using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260907120000_AddLoyaltyApplyMode")]
    public partial class AddLoyaltyApplyMode : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.SpecialOffer', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.SpecialOffer', N'LoyaltyApplyMode') IS NULL
                    ALTER TABLE [dbo].[SpecialOffer] ADD [LoyaltyApplyMode] int NOT NULL
                        CONSTRAINT [DF_SpecialOffer_LoyaltyApplyMode] DEFAULT (0);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.SpecialOffer', N'LoyaltyApplyMode') IS NOT NULL
                BEGIN
                    DECLARE @df sysname =
                        (SELECT dc.name FROM sys.default_constraints dc
                         INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
                         WHERE dc.parent_object_id = OBJECT_ID(N'dbo.SpecialOffer') AND c.name = N'LoyaltyApplyMode');
                    IF @df IS NOT NULL EXEC(N'ALTER TABLE [dbo].[SpecialOffer] DROP CONSTRAINT [' + @df + N']');
                    ALTER TABLE [dbo].[SpecialOffer] DROP COLUMN [LoyaltyApplyMode];
                END
                """);
        }
    }
}
