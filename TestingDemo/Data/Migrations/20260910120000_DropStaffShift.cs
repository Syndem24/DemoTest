using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260910120000_DropStaffShift")]
    public partial class DropStaffShift : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StaffShift', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffShift];
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StaffShift', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[StaffShift] (
                        [Id] int NOT NULL IDENTITY,
                        [StaffUserId] nvarchar(450) NOT NULL,
                        [StaffDisplayName] nvarchar(120) NOT NULL,
                        [StartedAtUtc] datetime2 NOT NULL,
                        [EndedAtUtc] datetime2 NULL,
                        [OpeningNote] nvarchar(2000) NULL,
                        [ClosingNote] nvarchar(2000) NULL,
                        [RoomsBriefing] nvarchar(4000) NULL,
                        [GuestsBriefing] nvarchar(4000) NULL,
                        [OffersBriefing] nvarchar(4000) NULL,
                        [GainNotes] nvarchar(2000) NULL,
                        [ClosingSummaryJson] nvarchar(max) NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [UpdatedAtUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_StaffShift] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_StaffShift_StaffUserId_StartedAtUtc]
                        ON [dbo].[StaffShift] ([StaffUserId], [StartedAtUtc]);
                    CREATE INDEX [IX_StaffShift_EndedAtUtc]
                        ON [dbo].[StaffShift] ([EndedAtUtc]);
                    CREATE UNIQUE INDEX [IX_StaffShift_StaffUserId_Open]
                        ON [dbo].[StaffShift] ([StaffUserId])
                        WHERE [EndedAtUtc] IS NULL;
                END
                """);
        }
    }
}
