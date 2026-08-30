using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260830140000_AddStaffDashboardLayout")]
    public partial class AddStaffDashboardLayout : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.StaffAccount', N'DashboardLayoutJson') IS NULL
                    ALTER TABLE [dbo].[StaffAccount] ADD [DashboardLayoutJson] nvarchar(max) NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.StaffAccount', N'DashboardLayoutJson') IS NOT NULL
                    ALTER TABLE [dbo].[StaffAccount] DROP COLUMN [DashboardLayoutJson];
                """);
        }
    }
}
