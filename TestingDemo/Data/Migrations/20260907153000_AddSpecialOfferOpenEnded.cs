using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260907153000_AddSpecialOfferOpenEnded")]
    public partial class AddSpecialOfferOpenEnded : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.SpecialOffer', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.SpecialOffer', N'OpenEnded') IS NULL
                    ALTER TABLE [dbo].[SpecialOffer] ADD [OpenEnded] bit NOT NULL
                        CONSTRAINT [DF_SpecialOffer_OpenEnded] DEFAULT (0);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.SpecialOffer', N'OpenEnded') IS NOT NULL
                BEGIN
                    DECLARE @df sysname =
                        (SELECT dc.name FROM sys.default_constraints dc
                         INNER JOIN sys.columns c ON c.default_object_id = dc.object_id
                         WHERE dc.parent_object_id = OBJECT_ID(N'dbo.SpecialOffer') AND c.name = N'OpenEnded');
                    IF @df IS NOT NULL EXEC(N'ALTER TABLE [dbo].[SpecialOffer] DROP CONSTRAINT [' + @df + N']');
                    ALTER TABLE [dbo].[SpecialOffer] DROP COLUMN [OpenEnded];
                END
                """);
        }
    }
}
