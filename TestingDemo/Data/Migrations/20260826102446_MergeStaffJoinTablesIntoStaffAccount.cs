using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class MergeStaffJoinTablesIntoStaffAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RoleId",
                table: "StaffAccount",
                type: "nvarchar(450)",
                maxLength: 450,
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE a
                SET a.[RoleId] = picked.[RoleId]
                FROM [dbo].[StaffAccount] a
                INNER JOIN (
                    SELECT [UserId], MIN([RoleId]) AS [RoleId]
                    FROM [dbo].[StaffAccountRole]
                    GROUP BY [UserId]
                ) picked ON picked.[UserId] = a.[Id]
                WHERE a.[RoleId] IS NULL;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_StaffAccount_RoleId",
                table: "StaffAccount",
                column: "RoleId");

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccount_StaffRole_RoleId",
                table: "StaffAccount",
                column: "RoleId",
                principalTable: "StaffRole",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.DropTable(
                name: "StaffAccountClaim");

            migrationBuilder.DropTable(
                name: "StaffAccountRole");

            migrationBuilder.DropTable(
                name: "StaffRoleClaim");

            migrationBuilder.DropTable(
                name: "StaffUser");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StaffAccountRole",
                columns: table => new
                {
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    RoleId = table.Column<string>(type: "nvarchar(450)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffAccountRole", x => new { x.UserId, x.RoleId });
                    table.ForeignKey(
                        name: "FK_StaffAccountRole_StaffAccount_UserId",
                        column: x => x.UserId,
                        principalTable: "StaffAccount",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StaffAccountRole_StaffRole_RoleId",
                        column: x => x.RoleId,
                        principalTable: "StaffRole",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql(
                """
                INSERT INTO [dbo].[StaffAccountRole] ([UserId], [RoleId])
                SELECT [Id], [RoleId]
                FROM [dbo].[StaffAccount]
                WHERE [RoleId] IS NOT NULL;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccount_StaffRole_RoleId",
                table: "StaffAccount");

            migrationBuilder.DropIndex(
                name: "IX_StaffAccount_RoleId",
                table: "StaffAccount");

            migrationBuilder.DropColumn(
                name: "RoleId",
                table: "StaffAccount");

            migrationBuilder.CreateTable(
                name: "StaffAccountClaim",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClaimType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClaimValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(450)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffAccountClaim", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffAccountClaim_StaffAccount_UserId",
                        column: x => x.UserId,
                        principalTable: "StaffAccount",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StaffRoleClaim",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ClaimType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ClaimValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RoleId = table.Column<string>(type: "nvarchar(450)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffRoleClaim", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffRoleClaim_StaffRole_RoleId",
                        column: x => x.RoleId,
                        principalTable: "StaffRole",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StaffUser",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    PasswordHash = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    Username = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffUser", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StaffAccountClaim_UserId",
                table: "StaffAccountClaim",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffAccountRole_RoleId",
                table: "StaffAccountRole",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffRoleClaim_RoleId",
                table: "StaffRoleClaim",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffUser_Username",
                table: "StaffUser",
                column: "Username",
                unique: true);
        }
    }
}
