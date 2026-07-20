using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class MoveRoomAttributesToRoomType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "RoomType",
                type: "datetime2",
                nullable: false,
                defaultValueSql: "GETUTCDATE()");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "RoomType",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Inclusions",
                table: "RoomType",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            // Copy shared attributes from one representative room per type.
            migrationBuilder.Sql(
                """
                UPDATE rt
                SET
                    rt.Description = src.Description,
                    rt.CreatedAt = src.CreatedAt,
                    rt.Inclusions = CASE
                        WHEN src.Inclusions IS NULL OR LTRIM(RTRIM(src.Inclusions)) = N'' THEN N'[]'
                        ELSE src.Inclusions
                    END
                FROM [RoomType] AS rt
                INNER JOIN (
                    SELECT
                        RoomTypeID,
                        Description,
                        CreatedAt,
                        Inclusions,
                        ROW_NUMBER() OVER (PARTITION BY RoomTypeID ORDER BY Id) AS rn
                    FROM [Room]
                ) AS src
                    ON src.RoomTypeID = rt.RoomTypeID
                   AND src.rn = 1;
                """);

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Room");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "Room");

            migrationBuilder.DropColumn(
                name: "Inclusions",
                table: "Room");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                table: "Room",
                type: "datetime2",
                nullable: false,
                defaultValueSql: "GETUTCDATE()");

            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "Room",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Inclusions",
                table: "Room",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.Sql(
                """
                UPDATE r
                SET
                    r.Description = rt.Description,
                    r.CreatedAt = rt.CreatedAt,
                    r.Inclusions = CASE
                        WHEN rt.Inclusions IS NULL OR LTRIM(RTRIM(rt.Inclusions)) = N'' THEN N'[]'
                        ELSE rt.Inclusions
                    END
                FROM [Room] AS r
                INNER JOIN [RoomType] AS rt ON rt.RoomTypeID = r.RoomTypeID;
                """);

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "RoomType");

            migrationBuilder.DropColumn(
                name: "Description",
                table: "RoomType");

            migrationBuilder.DropColumn(
                name: "Inclusions",
                table: "RoomType");
        }
    }
}
