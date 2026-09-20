using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class RenameStaffAuthToAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NOTE: Guarded SQL — DatabaseBootstrap reconciles schema drift, so live
            // databases may carry constraint/index names from the AspNet*/StaffAccount*
            // generations rather than the EF snapshot's names. Every rename is
            // existence-checked so this migration is idempotent on any generation.
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.StaffUser', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.AccountUser', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffUser', N'AccountUser';
                IF OBJECT_ID(N'dbo.StaffRole', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.AccountRole', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffRole', N'AccountRole';
                IF OBJECT_ID(N'dbo.StaffExternalLogin', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.AccountExternalLogin', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffExternalLogin', N'AccountExternalLogin';
                IF OBJECT_ID(N'dbo.StaffAuthToken', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.AccountAuthToken', N'U') IS NULL
                    EXEC sp_rename N'dbo.StaffAuthToken', N'AccountAuthToken';

                -- Primary keys (any known generation of names)
                IF OBJECT_ID(N'PK_StaffUser', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffUser', N'PK_AccountUser', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffAccount', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccount', N'PK_AccountUser', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffRole', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffRole', N'PK_AccountRole', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffExternalLogin', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffExternalLogin', N'PK_AccountExternalLogin', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffAccountLogin', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccountLogin', N'PK_AccountExternalLogin', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffAuthToken', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAuthToken', N'PK_AccountAuthToken', N'OBJECT';
                IF OBJECT_ID(N'PK_StaffAccountToken', N'PK') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccountToken', N'PK_AccountAuthToken', N'OBJECT';

                -- Foreign keys
                IF OBJECT_ID(N'FK_StaffUser_StaffRole_RoleId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffUser_StaffRole_RoleId', N'FK_AccountUser_AccountRole_RoleId', N'OBJECT';
                IF OBJECT_ID(N'FK_StaffAccount_StaffRole_RoleId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffAccount_StaffRole_RoleId', N'FK_AccountUser_AccountRole_RoleId', N'OBJECT';
                IF OBJECT_ID(N'FK_StaffExternalLogin_StaffUser_UserId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffExternalLogin_StaffUser_UserId', N'FK_AccountExternalLogin_AccountUser_UserId', N'OBJECT';
                IF OBJECT_ID(N'FK_StaffAccountLogin_StaffAccount_UserId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffAccountLogin_StaffAccount_UserId', N'FK_AccountExternalLogin_AccountUser_UserId', N'OBJECT';
                IF OBJECT_ID(N'FK_StaffAuthToken_StaffUser_UserId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffAuthToken_StaffUser_UserId', N'FK_AccountAuthToken_AccountUser_UserId', N'OBJECT';
                IF OBJECT_ID(N'FK_StaffAccountToken_StaffAccount_UserId', N'F') IS NOT NULL
                    EXEC sp_rename N'FK_StaffAccountToken_StaffAccount_UserId', N'FK_AccountAuthToken_AccountUser_UserId', N'OBJECT';

                -- Indexes on the renamed tables
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffUser_RoleId' AND object_id = OBJECT_ID(N'dbo.AccountUser'))
                    EXEC sp_rename N'dbo.AccountUser.IX_StaffUser_RoleId', N'IX_AccountUser_RoleId', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffAccount_RoleId' AND object_id = OBJECT_ID(N'dbo.AccountUser'))
                    EXEC sp_rename N'dbo.AccountUser.IX_StaffAccount_RoleId', N'IX_AccountUser_RoleId', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffUser_NormalizedGoogleEmail' AND object_id = OBJECT_ID(N'dbo.AccountUser'))
                    EXEC sp_rename N'dbo.AccountUser.IX_StaffUser_NormalizedGoogleEmail', N'IX_AccountUser_NormalizedGoogleEmail', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffAccount_NormalizedGoogleEmail' AND object_id = OBJECT_ID(N'dbo.AccountUser'))
                    EXEC sp_rename N'dbo.AccountUser.IX_StaffAccount_NormalizedGoogleEmail', N'IX_AccountUser_NormalizedGoogleEmail', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffExternalLogin_UserId' AND object_id = OBJECT_ID(N'dbo.AccountExternalLogin'))
                    EXEC sp_rename N'dbo.AccountExternalLogin.IX_StaffExternalLogin_UserId', N'IX_AccountExternalLogin_UserId', N'INDEX';
                IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StaffAccountLogin_UserId' AND object_id = OBJECT_ID(N'dbo.AccountExternalLogin'))
                    EXEC sp_rename N'dbo.AccountExternalLogin.IX_StaffAccountLogin_UserId', N'IX_AccountExternalLogin_UserId', N'INDEX';

                -- Audit target label follows the new table name
                UPDATE [dbo].[SystemAuditLog] SET [TargetType] = N'AccountUser' WHERE [TargetType] = N'StaffUser';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'dbo.AccountUser', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.StaffUser', N'U') IS NULL
                    EXEC sp_rename N'dbo.AccountUser', N'StaffUser';
                IF OBJECT_ID(N'dbo.AccountRole', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.StaffRole', N'U') IS NULL
                    EXEC sp_rename N'dbo.AccountRole', N'StaffRole';
                IF OBJECT_ID(N'dbo.AccountExternalLogin', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.StaffExternalLogin', N'U') IS NULL
                    EXEC sp_rename N'dbo.AccountExternalLogin', N'StaffExternalLogin';
                IF OBJECT_ID(N'dbo.AccountAuthToken', N'U') IS NOT NULL
                   AND OBJECT_ID(N'dbo.StaffAuthToken', N'U') IS NULL
                    EXEC sp_rename N'dbo.AccountAuthToken', N'StaffAuthToken';

                UPDATE [dbo].[SystemAuditLog] SET [TargetType] = N'StaffUser' WHERE [TargetType] = N'AccountUser';
                """);
        }
    }
}
