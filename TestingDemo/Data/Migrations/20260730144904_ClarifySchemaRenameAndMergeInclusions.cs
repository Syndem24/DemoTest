using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class ClarifySchemaRenameAndMergeInclusions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Flatten CustomCategories[].Items into Inclusions, then drop the column.
            migrationBuilder.Sql("""
                ;WITH CategoryItems AS (
                    SELECT
                        rt.RoomTypeID AS RoomTypeId,
                        LTRIM(RTRIM(item.value)) AS Item
                    FROM RoomType rt
                    CROSS APPLY OPENJSON(ISNULL(NULLIF(LTRIM(RTRIM(rt.CustomCategories)), ''), '[]')) cat
                    CROSS APPLY OPENJSON(
                        COALESCE(
                            JSON_QUERY(cat.value, '$.Items'),
                            JSON_QUERY(cat.value, '$.items'),
                            '[]'))
                        WITH (value nvarchar(200) '$') item
                    WHERE LTRIM(RTRIM(ISNULL(item.value, ''))) <> ''
                ),
                InclusionItems AS (
                    SELECT
                        rt.RoomTypeID AS RoomTypeId,
                        LTRIM(RTRIM(j.value)) AS Item
                    FROM RoomType rt
                    CROSS APPLY OPENJSON(ISNULL(NULLIF(LTRIM(RTRIM(rt.Inclusions)), ''), '[]'))
                        WITH (value nvarchar(200) '$') j
                    WHERE LTRIM(RTRIM(ISNULL(j.value, ''))) <> ''
                ),
                Merged AS (
                    SELECT RoomTypeId, Item
                    FROM InclusionItems
                    UNION
                    SELECT RoomTypeId, Item
                    FROM CategoryItems
                ),
                DistinctMerged AS (
                    SELECT RoomTypeId, Item
                    FROM (
                        SELECT
                            RoomTypeId,
                            Item,
                            ROW_NUMBER() OVER (
                                PARTITION BY RoomTypeId, LOWER(Item)
                                ORDER BY Item) AS rn
                        FROM Merged
                    ) ranked
                    WHERE rn = 1
                ),
                Aggregated AS (
                    SELECT
                        RoomTypeId,
                        CONCAT('[', STRING_AGG(QUOTENAME(Item, '"'), ','), ']') AS InclusionsJson
                    FROM DistinctMerged
                    GROUP BY RoomTypeId
                )
                UPDATE rt
                SET Inclusions = ISNULL(a.InclusionsJson, '[]')
                FROM RoomType rt
                LEFT JOIN Aggregated a ON a.RoomTypeId = rt.RoomTypeID
                WHERE rt.CustomCategories IS NOT NULL
                  AND LTRIM(RTRIM(rt.CustomCategories)) NOT IN ('', '[]', 'null');

                UPDATE RoomType
                SET Inclusions = '[]'
                WHERE Inclusions IS NULL OR LTRIM(RTRIM(Inclusions)) = '';
                """);

            migrationBuilder.DropColumn(
                name: "CustomCategories",
                table: "RoomType");

            migrationBuilder.RenameColumn(
                name: "TypeName",
                table: "RoomType",
                newName: "Name");

            migrationBuilder.RenameIndex(
                name: "IX_RoomType_TypeName",
                table: "RoomType",
                newName: "IX_RoomType_Name");

            migrationBuilder.RenameTable(
                name: "BookingLine",
                newName: "BookingItem");

            migrationBuilder.RenameIndex(
                name: "IX_BookingLine_BookingId_RoomTypeId",
                table: "BookingItem",
                newName: "IX_BookingItem_BookingId_RoomTypeId");

            migrationBuilder.RenameIndex(
                name: "IX_BookingLine_RoomTypeId",
                table: "BookingItem",
                newName: "IX_BookingItem_RoomTypeId");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingLine_Booking_BookingId",
                table: "BookingItem");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingLine_RoomType_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.AddForeignKey(
                name: "FK_BookingItem_Booking_BookingId",
                table: "BookingItem",
                column: "BookingId",
                principalTable: "Booking",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem",
                column: "RoomTypeId",
                principalTable: "RoomType",
                principalColumn: "RoomTypeID",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.DropForeignKey(
                name: "FK_BookingRoomAssignment_BookingLine_BookingLineId",
                table: "BookingRoomAssignment");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingRoomAssignment_Room_RoomId",
                table: "BookingRoomAssignment");

            migrationBuilder.RenameTable(
                name: "BookingRoomAssignment",
                newName: "AssignedRoom");

            migrationBuilder.RenameColumn(
                name: "BookingLineId",
                table: "AssignedRoom",
                newName: "BookingItemId");

            migrationBuilder.RenameIndex(
                name: "IX_BookingRoomAssignment_BookingLineId_RoomId",
                table: "AssignedRoom",
                newName: "IX_AssignedRoom_BookingItemId_RoomId");

            migrationBuilder.RenameIndex(
                name: "IX_BookingRoomAssignment_RoomId",
                table: "AssignedRoom",
                newName: "IX_AssignedRoom_RoomId");

            migrationBuilder.AddForeignKey(
                name: "FK_AssignedRoom_BookingItem_BookingItemId",
                table: "AssignedRoom",
                column: "BookingItemId",
                principalTable: "BookingItem",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AssignedRoom_Room_RoomId",
                table: "AssignedRoom",
                column: "RoomId",
                principalTable: "Room",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AssignedRoom_BookingItem_BookingItemId",
                table: "AssignedRoom");

            migrationBuilder.DropForeignKey(
                name: "FK_AssignedRoom_Room_RoomId",
                table: "AssignedRoom");

            migrationBuilder.RenameIndex(
                name: "IX_AssignedRoom_BookingItemId_RoomId",
                table: "AssignedRoom",
                newName: "IX_BookingRoomAssignment_BookingLineId_RoomId");

            migrationBuilder.RenameIndex(
                name: "IX_AssignedRoom_RoomId",
                table: "AssignedRoom",
                newName: "IX_BookingRoomAssignment_RoomId");

            migrationBuilder.RenameColumn(
                name: "BookingItemId",
                table: "AssignedRoom",
                newName: "BookingLineId");

            migrationBuilder.RenameTable(
                name: "AssignedRoom",
                newName: "BookingRoomAssignment");

            migrationBuilder.AddForeignKey(
                name: "FK_BookingRoomAssignment_BookingLine_BookingLineId",
                table: "BookingRoomAssignment",
                column: "BookingLineId",
                principalTable: "BookingItem",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingRoomAssignment_Room_RoomId",
                table: "BookingRoomAssignment",
                column: "RoomId",
                principalTable: "Room",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.DropForeignKey(
                name: "FK_BookingItem_Booking_BookingId",
                table: "BookingItem");

            migrationBuilder.DropForeignKey(
                name: "FK_BookingItem_RoomType_RoomTypeId",
                table: "BookingItem");

            migrationBuilder.RenameIndex(
                name: "IX_BookingItem_BookingId_RoomTypeId",
                table: "BookingItem",
                newName: "IX_BookingLine_BookingId_RoomTypeId");

            migrationBuilder.RenameIndex(
                name: "IX_BookingItem_RoomTypeId",
                table: "BookingItem",
                newName: "IX_BookingLine_RoomTypeId");

            migrationBuilder.RenameTable(
                name: "BookingItem",
                newName: "BookingLine");

            migrationBuilder.AddForeignKey(
                name: "FK_BookingLine_Booking_BookingId",
                table: "BookingLine",
                column: "BookingId",
                principalTable: "Booking",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_BookingLine_RoomType_RoomTypeId",
                table: "BookingLine",
                column: "RoomTypeId",
                principalTable: "RoomType",
                principalColumn: "RoomTypeID",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.RenameIndex(
                name: "IX_RoomType_Name",
                table: "RoomType",
                newName: "IX_RoomType_TypeName");

            migrationBuilder.RenameColumn(
                name: "Name",
                table: "RoomType",
                newName: "TypeName");

            migrationBuilder.AddColumn<string>(
                name: "CustomCategories",
                table: "RoomType",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "[]");
        }
    }
}
