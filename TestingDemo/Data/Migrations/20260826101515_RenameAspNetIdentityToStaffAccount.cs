using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameAspNetIdentityToStaffAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AspNetRoleClaims_AspNetRoles_RoleId",
                table: "AspNetRoleClaims");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserClaims_AspNetUsers_UserId",
                table: "AspNetUserClaims");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserLogins_AspNetUsers_UserId",
                table: "AspNetUserLogins");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserRoles_AspNetRoles_RoleId",
                table: "AspNetUserRoles");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserRoles_AspNetUsers_UserId",
                table: "AspNetUserRoles");

            migrationBuilder.DropForeignKey(
                name: "FK_AspNetUserTokens_AspNetUsers_UserId",
                table: "AspNetUserTokens");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetUserTokens",
                table: "AspNetUserTokens");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetUsers",
                table: "AspNetUsers");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetUserRoles",
                table: "AspNetUserRoles");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetUserLogins",
                table: "AspNetUserLogins");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetUserClaims",
                table: "AspNetUserClaims");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetRoles",
                table: "AspNetRoles");

            migrationBuilder.DropPrimaryKey(
                name: "PK_AspNetRoleClaims",
                table: "AspNetRoleClaims");

            migrationBuilder.RenameTable(
                name: "AspNetUserTokens",
                newName: "StaffAccountToken");

            migrationBuilder.RenameTable(
                name: "AspNetUsers",
                newName: "StaffAccount");

            migrationBuilder.RenameTable(
                name: "AspNetUserRoles",
                newName: "StaffAccountRole");

            migrationBuilder.RenameTable(
                name: "AspNetUserLogins",
                newName: "StaffAccountLogin");

            migrationBuilder.RenameTable(
                name: "AspNetUserClaims",
                newName: "StaffAccountClaim");

            migrationBuilder.RenameTable(
                name: "AspNetRoles",
                newName: "StaffRole");

            migrationBuilder.RenameTable(
                name: "AspNetRoleClaims",
                newName: "StaffRoleClaim");

            migrationBuilder.RenameIndex(
                name: "IX_AspNetUsers_NormalizedGoogleEmail",
                table: "StaffAccount",
                newName: "IX_StaffAccount_NormalizedGoogleEmail");

            migrationBuilder.RenameIndex(
                name: "IX_AspNetUserRoles_RoleId",
                table: "StaffAccountRole",
                newName: "IX_StaffAccountRole_RoleId");

            migrationBuilder.RenameIndex(
                name: "IX_AspNetUserLogins_UserId",
                table: "StaffAccountLogin",
                newName: "IX_StaffAccountLogin_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_AspNetUserClaims_UserId",
                table: "StaffAccountClaim",
                newName: "IX_StaffAccountClaim_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_AspNetRoleClaims_RoleId",
                table: "StaffRoleClaim",
                newName: "IX_StaffRoleClaim_RoleId");

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffAccountToken",
                table: "StaffAccountToken",
                columns: new[] { "UserId", "LoginProvider", "Name" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffAccount",
                table: "StaffAccount",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffAccountRole",
                table: "StaffAccountRole",
                columns: new[] { "UserId", "RoleId" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffAccountLogin",
                table: "StaffAccountLogin",
                columns: new[] { "LoginProvider", "ProviderKey" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffAccountClaim",
                table: "StaffAccountClaim",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffRole",
                table: "StaffRole",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_StaffRoleClaim",
                table: "StaffRoleClaim",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccountClaim_StaffAccount_UserId",
                table: "StaffAccountClaim",
                column: "UserId",
                principalTable: "StaffAccount",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccountLogin_StaffAccount_UserId",
                table: "StaffAccountLogin",
                column: "UserId",
                principalTable: "StaffAccount",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccountRole_StaffAccount_UserId",
                table: "StaffAccountRole",
                column: "UserId",
                principalTable: "StaffAccount",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccountRole_StaffRole_RoleId",
                table: "StaffAccountRole",
                column: "RoleId",
                principalTable: "StaffRole",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffAccountToken_StaffAccount_UserId",
                table: "StaffAccountToken",
                column: "UserId",
                principalTable: "StaffAccount",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_StaffRoleClaim_StaffRole_RoleId",
                table: "StaffRoleClaim",
                column: "RoleId",
                principalTable: "StaffRole",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccountClaim_StaffAccount_UserId",
                table: "StaffAccountClaim");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccountLogin_StaffAccount_UserId",
                table: "StaffAccountLogin");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccountRole_StaffAccount_UserId",
                table: "StaffAccountRole");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccountRole_StaffRole_RoleId",
                table: "StaffAccountRole");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffAccountToken_StaffAccount_UserId",
                table: "StaffAccountToken");

            migrationBuilder.DropForeignKey(
                name: "FK_StaffRoleClaim_StaffRole_RoleId",
                table: "StaffRoleClaim");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffRoleClaim",
                table: "StaffRoleClaim");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffRole",
                table: "StaffRole");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffAccountToken",
                table: "StaffAccountToken");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffAccountRole",
                table: "StaffAccountRole");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffAccountLogin",
                table: "StaffAccountLogin");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffAccountClaim",
                table: "StaffAccountClaim");

            migrationBuilder.DropPrimaryKey(
                name: "PK_StaffAccount",
                table: "StaffAccount");

            migrationBuilder.RenameTable(
                name: "StaffRoleClaim",
                newName: "AspNetRoleClaims");

            migrationBuilder.RenameTable(
                name: "StaffRole",
                newName: "AspNetRoles");

            migrationBuilder.RenameTable(
                name: "StaffAccountToken",
                newName: "AspNetUserTokens");

            migrationBuilder.RenameTable(
                name: "StaffAccountRole",
                newName: "AspNetUserRoles");

            migrationBuilder.RenameTable(
                name: "StaffAccountLogin",
                newName: "AspNetUserLogins");

            migrationBuilder.RenameTable(
                name: "StaffAccountClaim",
                newName: "AspNetUserClaims");

            migrationBuilder.RenameTable(
                name: "StaffAccount",
                newName: "AspNetUsers");

            migrationBuilder.RenameIndex(
                name: "IX_StaffRoleClaim_RoleId",
                table: "AspNetRoleClaims",
                newName: "IX_AspNetRoleClaims_RoleId");

            migrationBuilder.RenameIndex(
                name: "IX_StaffAccountRole_RoleId",
                table: "AspNetUserRoles",
                newName: "IX_AspNetUserRoles_RoleId");

            migrationBuilder.RenameIndex(
                name: "IX_StaffAccountLogin_UserId",
                table: "AspNetUserLogins",
                newName: "IX_AspNetUserLogins_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_StaffAccountClaim_UserId",
                table: "AspNetUserClaims",
                newName: "IX_AspNetUserClaims_UserId");

            migrationBuilder.RenameIndex(
                name: "IX_StaffAccount_NormalizedGoogleEmail",
                table: "AspNetUsers",
                newName: "IX_AspNetUsers_NormalizedGoogleEmail");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetRoleClaims",
                table: "AspNetRoleClaims",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetRoles",
                table: "AspNetRoles",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetUserTokens",
                table: "AspNetUserTokens",
                columns: new[] { "UserId", "LoginProvider", "Name" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetUserRoles",
                table: "AspNetUserRoles",
                columns: new[] { "UserId", "RoleId" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetUserLogins",
                table: "AspNetUserLogins",
                columns: new[] { "LoginProvider", "ProviderKey" });

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetUserClaims",
                table: "AspNetUserClaims",
                column: "Id");

            migrationBuilder.AddPrimaryKey(
                name: "PK_AspNetUsers",
                table: "AspNetUsers",
                column: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetRoleClaims_AspNetRoles_RoleId",
                table: "AspNetRoleClaims",
                column: "RoleId",
                principalTable: "AspNetRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserClaims_AspNetUsers_UserId",
                table: "AspNetUserClaims",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserLogins_AspNetUsers_UserId",
                table: "AspNetUserLogins",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserRoles_AspNetRoles_RoleId",
                table: "AspNetUserRoles",
                column: "RoleId",
                principalTable: "AspNetRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserRoles_AspNetUsers_UserId",
                table: "AspNetUserRoles",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AspNetUserTokens_AspNetUsers_UserId",
                table: "AspNetUserTokens",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
