using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260902120000_ConsolidateStaffAuthSchema")]
    public partial class ConsolidateStaffAuthSchema : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            -- Migrate legacy staff account audit rows not already mirrored in SystemAuditLog.
            IF OBJECT_ID(N'[dbo].[StaffAccountAudit]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[SystemAuditLog]', N'U') IS NOT NULL
            BEGIN
                INSERT INTO [dbo].[SystemAuditLog] (
                    [AtUtc], [Intent], [Domain], [Action], [ActorUserId], [ActorDisplayName],
                    [TargetType], [TargetId], [TargetLabel], [Reason], [Summary])
                SELECT
                    s.[AtUtc],
                    'AdministrativeAction',
                    'Account',
                    CASE
                        WHEN s.[Action] LIKE 'Account.%' THEN LEFT(s.[Action], 80)
                        ELSE LEFT('Account.' + s.[Action], 80)
                    END,
                    LEFT(s.[PerformedByUserId], 450),
                    '',
                    'StaffUser',
                    LEFT(s.[TargetUserId], 80),
                    '',
                    NULL,
                    LEFT(ISNULL(s.[RoleAssigned], s.[Action]), 500)
                FROM [dbo].[StaffAccountAudit] s
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM [dbo].[SystemAuditLog] l
                    WHERE l.[Domain] = 'Account'
                      AND l.[TargetId] = s.[TargetUserId]
                      AND ABS(DATEDIFF(second, l.[AtUtc], s.[AtUtc])) <= 2
                      AND (
                          l.[Action] = CASE
                              WHEN s.[Action] LIKE 'Account.%' THEN LEFT(s.[Action], 80)
                              ELSE LEFT('Account.' + s.[Action], 80)
                          END
                          OR l.[Summary] = LEFT(ISNULL(s.[RoleAssigned], s.[Action]), 500)
                      )
                );
            END

            IF OBJECT_ID(N'[dbo].[StaffAccountAudit]', N'U') IS NOT NULL
                DROP TABLE [dbo].[StaffAccountAudit];

            IF OBJECT_ID(N'[dbo].[FK_StaffAccountLogin_StaffAccount_UserId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffAccountLogin] DROP CONSTRAINT [FK_StaffAccountLogin_StaffAccount_UserId];
            IF OBJECT_ID(N'[dbo].[FK_StaffAccountToken_StaffAccount_UserId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffAccountToken] DROP CONSTRAINT [FK_StaffAccountToken_StaffAccount_UserId];
            IF OBJECT_ID(N'[dbo].[FK_StaffAccount_StaffRole_RoleId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffAccount] DROP CONSTRAINT [FK_StaffAccount_StaffRole_RoleId];

            IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NULL
                EXEC sp_rename N'[dbo].[StaffAccount]', N'StaffUser';

            IF OBJECT_ID(N'[dbo].[PK_StaffAccount]', N'OBJECT') IS NOT NULL
                EXEC sp_rename N'PK_StaffAccount', N'PK_StaffUser', N'OBJECT';

            IF OBJECT_ID(N'[dbo].[StaffAccountLogin]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffExternalLogin]', N'U') IS NULL
                EXEC sp_rename N'[dbo].[StaffAccountLogin]', N'StaffExternalLogin';

            IF OBJECT_ID(N'[dbo].[PK_StaffAccountLogin]', N'OBJECT') IS NOT NULL
                EXEC sp_rename N'PK_StaffAccountLogin', N'PK_StaffExternalLogin', N'OBJECT';

            IF OBJECT_ID(N'[dbo].[StaffAccountToken]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffAuthToken]', N'U') IS NULL
                EXEC sp_rename N'[dbo].[StaffAccountToken]', N'StaffAuthToken';

            IF OBJECT_ID(N'[dbo].[PK_StaffAccountToken]', N'OBJECT') IS NOT NULL
                EXEC sp_rename N'PK_StaffAccountToken', N'PK_StaffAuthToken', N'OBJECT';

            IF OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffPasswordResetCode]', N'U') IS NULL
                EXEC sp_rename N'[dbo].[StaffPasswordResetOtp]', N'StaffPasswordResetCode';

            IF OBJECT_ID(N'[dbo].[PK_StaffPasswordResetOtp]', N'OBJECT') IS NOT NULL
                EXEC sp_rename N'PK_StaffPasswordResetOtp', N'PK_StaffPasswordResetCode', N'OBJECT';

            IF OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[FK_StaffUser_StaffRole_RoleId]', N'F') IS NULL
               AND COL_LENGTH(N'dbo.StaffUser', N'RoleId') IS NOT NULL
                ALTER TABLE [dbo].[StaffUser] WITH CHECK
                ADD CONSTRAINT [FK_StaffUser_StaffRole_RoleId]
                FOREIGN KEY ([RoleId]) REFERENCES [dbo].[StaffRole] ([Id]) ON DELETE SET NULL;

            IF OBJECT_ID(N'[dbo].[StaffExternalLogin]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[FK_StaffExternalLogin_StaffUser_UserId]', N'F') IS NULL
                ALTER TABLE [dbo].[StaffExternalLogin] WITH CHECK
                ADD CONSTRAINT [FK_StaffExternalLogin_StaffUser_UserId]
                FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffUser] ([Id]) ON DELETE CASCADE;

            IF OBJECT_ID(N'[dbo].[StaffAuthToken]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[FK_StaffAuthToken_StaffUser_UserId]', N'F') IS NULL
                ALTER TABLE [dbo].[StaffAuthToken] WITH CHECK
                ADD CONSTRAINT [FK_StaffAuthToken_StaffUser_UserId]
                FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffUser] ([Id]) ON DELETE CASCADE;

            UPDATE [dbo].[SystemAuditLog]
            SET [TargetType] = 'StaffUser'
            WHERE [TargetType] = 'StaffAccount';
            """);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(
            """
            -- Down migration is best-effort; audit rows merged into SystemAuditLog are not split back.
            IF OBJECT_ID(N'[dbo].[FK_StaffExternalLogin_StaffUser_UserId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffExternalLogin] DROP CONSTRAINT [FK_StaffExternalLogin_StaffUser_UserId];
            IF OBJECT_ID(N'[dbo].[FK_StaffAuthToken_StaffUser_UserId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffAuthToken] DROP CONSTRAINT [FK_StaffAuthToken_StaffUser_UserId];
            IF OBJECT_ID(N'[dbo].[FK_StaffUser_StaffRole_RoleId]', N'F') IS NOT NULL
                ALTER TABLE [dbo].[StaffUser] DROP CONSTRAINT [FK_StaffUser_StaffRole_RoleId];

            IF OBJECT_ID(N'[dbo].[StaffPasswordResetCode]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NULL
            BEGIN
                EXEC sp_rename N'[dbo].[StaffPasswordResetCode]', N'StaffPasswordResetOtp';
                IF OBJECT_ID(N'PK_StaffPasswordResetCode', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffPasswordResetCode', N'PK_StaffPasswordResetOtp', N'OBJECT';
            END

            IF OBJECT_ID(N'[dbo].[StaffAuthToken]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffAccountToken]', N'U') IS NULL
            BEGIN
                EXEC sp_rename N'[dbo].[StaffAuthToken]', N'StaffAccountToken';
                IF OBJECT_ID(N'PK_StaffAuthToken', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAuthToken', N'PK_StaffAccountToken', N'OBJECT';
            END

            IF OBJECT_ID(N'[dbo].[StaffExternalLogin]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffAccountLogin]', N'U') IS NULL
            BEGIN
                EXEC sp_rename N'[dbo].[StaffExternalLogin]', N'StaffAccountLogin';
                IF OBJECT_ID(N'PK_StaffExternalLogin', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffExternalLogin', N'PK_StaffAccountLogin', N'OBJECT';
            END

            IF OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NOT NULL
               AND OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NULL
            BEGIN
                EXEC sp_rename N'[dbo].[StaffUser]', N'StaffAccount';
                IF OBJECT_ID(N'PK_StaffUser', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffUser', N'PK_StaffAccount', N'OBJECT';
            END

            IF OBJECT_ID(N'[dbo].[StaffAccountAudit]', N'U') IS NULL
            BEGIN
                CREATE TABLE [dbo].[StaffAccountAudit] (
                    [Id] int NOT NULL IDENTITY,
                    [Action] nvarchar(40) NOT NULL,
                    [TargetUserId] nvarchar(450) NOT NULL,
                    [PerformedByUserId] nvarchar(450) NOT NULL,
                    [RoleAssigned] nvarchar(64) NOT NULL,
                    [AtUtc] datetime2 NOT NULL,
                    CONSTRAINT [PK_StaffAccountAudit] PRIMARY KEY ([Id])
                );
                CREATE INDEX [IX_StaffAccountAudit_AtUtc] ON [dbo].[StaffAccountAudit] ([AtUtc]);
            END

            UPDATE [dbo].[SystemAuditLog]
            SET [TargetType] = 'StaffAccount'
            WHERE [TargetType] = 'StaffUser';
            """);
    }
}
}
