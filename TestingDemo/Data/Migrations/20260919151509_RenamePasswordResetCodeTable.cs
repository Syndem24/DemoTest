using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenamePasswordResetCodeTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded sp_rename — preserves pending reset-code rows and stays
            // idempotent across bootstrap-managed schema generations.
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StaffPasswordResetCode', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.PasswordResetCode', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffPasswordResetCode', N'PasswordResetCode';
                ELSE IF OBJECT_ID(N'dbo.StaffPasswordResetOtp', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.PasswordResetCode', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffPasswordResetOtp', N'PasswordResetCode';

                IF OBJECT_ID(N'PK_StaffPasswordResetCode', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffPasswordResetCode', N'PK_PasswordResetCode', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffPasswordResetOtp', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffPasswordResetOtp', N'PK_PasswordResetCode', N'OBJECT';

                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffPasswordResetCode_UserId_CreatedAtUtc' AND object_id = OBJECT_ID(N'dbo.PasswordResetCode'))
                    EXEC sp_rename N'dbo.PasswordResetCode.IX_StaffPasswordResetCode_UserId_CreatedAtUtc', N'IX_PasswordResetCode_UserId_CreatedAtUtc', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffPasswordResetCode_NormalizedEmail_ExpiresAtUtc' AND object_id = OBJECT_ID(N'dbo.PasswordResetCode'))
                    EXEC sp_rename N'dbo.PasswordResetCode.IX_StaffPasswordResetCode_NormalizedEmail_ExpiresAtUtc', N'IX_PasswordResetCode_NormalizedEmail_ExpiresAtUtc', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffPasswordResetOtp_UserId_CreatedAtUtc' AND object_id = OBJECT_ID(N'dbo.PasswordResetCode'))
                    EXEC sp_rename N'dbo.PasswordResetCode.IX_StaffPasswordResetOtp_UserId_CreatedAtUtc', N'IX_PasswordResetCode_UserId_CreatedAtUtc', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffPasswordResetOtp_NormalizedEmail_ExpiresAtUtc' AND object_id = OBJECT_ID(N'dbo.PasswordResetCode'))
                    EXEC sp_rename N'dbo.PasswordResetCode.IX_StaffPasswordResetOtp_NormalizedEmail_ExpiresAtUtc', N'IX_PasswordResetCode_NormalizedEmail_ExpiresAtUtc', N'INDEX';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.PasswordResetCode', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.StaffPasswordResetCode', N'U') IS NULL
                    EXEC sp_rename N'dbo.PasswordResetCode', N'StaffPasswordResetCode';
                """);
        }
    }
}
