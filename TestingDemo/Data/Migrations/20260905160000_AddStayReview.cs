using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260905160000_AddStayReview")]
    public partial class AddStayReview : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[StayReview] (
                        [Id] int NOT NULL IDENTITY,
                        [BookingId] int NOT NULL,
                        [GuestUserId] nvarchar(450) NOT NULL,
                        [DisplayName] nvarchar(80) NOT NULL,
                        [OverallRating] tinyint NOT NULL,
                        [StaffRating] tinyint NOT NULL,
                        [ComfortRating] tinyint NOT NULL,
                        [FacilitiesRating] tinyint NOT NULL,
                        [WouldRecommend] bit NULL,
                        [Comment] nvarchar(2000) NULL,
                        [TagsJson] nvarchar(1000) NULL,
                        [IsPublished] bit NOT NULL CONSTRAINT [DF_StayReview_IsPublished] DEFAULT (1),
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [UpdatedAtUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_StayReview] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_StayReview_Booking_BookingId]
                            FOREIGN KEY ([BookingId]) REFERENCES [dbo].[Booking] ([Id]) ON DELETE CASCADE,
                        CONSTRAINT [CK_StayReview_OverallRating] CHECK ([OverallRating] BETWEEN 1 AND 5),
                        CONSTRAINT [CK_StayReview_StaffRating] CHECK ([StaffRating] BETWEEN 1 AND 5),
                        CONSTRAINT [CK_StayReview_ComfortRating] CHECK ([ComfortRating] BETWEEN 1 AND 5),
                        CONSTRAINT [CK_StayReview_FacilitiesRating] CHECK ([FacilitiesRating] BETWEEN 1 AND 5)
                    );
                    CREATE UNIQUE INDEX [IX_StayReview_BookingId] ON [dbo].[StayReview] ([BookingId]);
                    CREATE INDEX [IX_StayReview_GuestUserId] ON [dbo].[StayReview] ([GuestUserId]);
                    CREATE INDEX [IX_StayReview_IsPublished_CreatedAtUtc]
                        ON [dbo].[StayReview] ([IsPublished], [CreatedAtUtc] DESC);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StayReview];
                """);
        }
    }
}
