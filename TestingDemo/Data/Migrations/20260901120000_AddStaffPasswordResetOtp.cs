using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260901120000_AddStaffPasswordResetOtp")]
    public partial class AddStaffPasswordResetOtp : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[StaffPasswordResetOtp] (
                        [Id] int NOT NULL IDENTITY,
                        [UserId] nvarchar(450) NOT NULL,
                        [NormalizedEmail] nvarchar(256) NOT NULL,
                        [CodeHash] nvarchar(128) NOT NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [ExpiresAtUtc] datetime2 NOT NULL,
                        [ConsumedAtUtc] datetime2 NULL,
                        [FailedAttempts] int NOT NULL DEFAULT 0,
                        CONSTRAINT [PK_StaffPasswordResetOtp] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_StaffPasswordResetOtp_UserId_CreatedAtUtc]
                        ON [dbo].[StaffPasswordResetOtp] ([UserId], [CreatedAtUtc]);
                    CREATE INDEX [IX_StaffPasswordResetOtp_NormalizedEmail_ExpiresAtUtc]
                        ON [dbo].[StaffPasswordResetOtp] ([NormalizedEmail], [ExpiresAtUtc]);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffPasswordResetOtp];
                """);
        }
    }
}
