using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class StayReviewScaleIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NOT NULL
                BEGIN
                    IF COL_LENGTH(N'dbo.StayReview', N'HasHotelReply') IS NULL
                        ALTER TABLE [dbo].[StayReview] ADD [HasHotelReply]
                            AS (CASE WHEN [HotelReply] IS NULL OR [HotelReply] = N''
                                THEN CONVERT(bit,0) ELSE CONVERT(bit,1) END) PERSISTED;

                    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                                   WHERE name = N'IX_StayReview_Created_Id'
                                     AND object_id = OBJECT_ID(N'dbo.StayReview'))
                        CREATE INDEX [IX_StayReview_Created_Id]
                            ON [dbo].[StayReview] ([CreatedAtUtc] DESC, [Id] DESC);

                    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                                   WHERE name = N'IX_StayReview_Reply_Created_Id'
                                     AND object_id = OBJECT_ID(N'dbo.StayReview'))
                        CREATE INDEX [IX_StayReview_Reply_Created_Id]
                            ON [dbo].[StayReview] ([HasHotelReply] ASC, [CreatedAtUtc] DESC, [Id] DESC);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StayReview', N'U') IS NOT NULL
                BEGIN
                    IF EXISTS (SELECT 1 FROM sys.indexes
                               WHERE name = N'IX_StayReview_Reply_Created_Id'
                                 AND object_id = OBJECT_ID(N'dbo.StayReview'))
                        DROP INDEX [IX_StayReview_Reply_Created_Id] ON [dbo].[StayReview];

                    IF EXISTS (SELECT 1 FROM sys.indexes
                               WHERE name = N'IX_StayReview_Created_Id'
                                 AND object_id = OBJECT_ID(N'dbo.StayReview'))
                        DROP INDEX [IX_StayReview_Created_Id] ON [dbo].[StayReview];

                    IF COL_LENGTH(N'dbo.StayReview', N'HasHotelReply') IS NOT NULL
                        ALTER TABLE [dbo].[StayReview] DROP COLUMN [HasHotelReply];
                END
                """);
        }
    }
}
