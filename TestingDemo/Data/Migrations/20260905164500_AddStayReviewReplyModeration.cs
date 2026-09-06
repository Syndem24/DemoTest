using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260905164500_AddStayReviewReplyModeration")]
    public partial class AddStayReviewReplyModeration : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReply') IS NULL
                        ALTER TABLE [dbo].[StayReview] ADD [HotelReply] nvarchar(1000) NULL;
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReplyAtUtc') IS NULL
                        ALTER TABLE [dbo].[StayReview] ADD [HotelReplyAtUtc] datetime2 NULL;
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReplyBy') IS NULL
                        ALTER TABLE [dbo].[StayReview] ADD [HotelReplyBy] nvarchar(120) NULL;
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReplyBy') IS NOT NULL
                        ALTER TABLE [dbo].[StayReview] DROP COLUMN [HotelReplyBy];
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReplyAtUtc') IS NOT NULL
                        ALTER TABLE [dbo].[StayReview] DROP COLUMN [HotelReplyAtUtc];
                    IF COL_LENGTH(N'dbo.StayReview', N'HotelReply') IS NOT NULL
                        ALTER TABLE [dbo].[StayReview] DROP COLUMN [HotelReply];
                END
                """);
        }
    }
}
