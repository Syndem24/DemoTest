using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace TestingDemo.Data;

public static class DatabaseBootstrap
{
    /// <summary>
    /// Applies EF migrations with clear errors for common "new device" failures
    /// (missing LocalDB, wrong connection string, partial schema).
    /// </summary>
    public static void ApplyMigrations(HotelBookingDbContext db, ILogger? logger = null)
    {
        try
        {
            TryStartLocalDb(db.Database.GetConnectionString(), logger);

            // Older zips used a multi-step migration chain. After squashing to one
            // baseline, stamp history whenever the final schema already exists but
            // the baseline migration id is missing (including empty history after a
            // partial rewrite).
            if (db.Database.CanConnect()
                && HasCurrentSchema(db)
                && !HasBaselineMigration(db))
            {
                logger?.LogInformation(
                    "Current Room/RoomType schema detected without baseline migration history. Stamping {MigrationId}.",
                    BaselineMigrationId);
                StampBaselineHistory(db);
            }

            db.Database.Migrate();
            EnsureSecureSettingTable(db);
            EnsureStaffPasswordResetCodeTable(db);
            EnsureSystemAuditLogTable(db);
            EnsureStaffDashboardLayoutColumn(db);
            EnsureStaffShiftTable(db);

            // Warm starts: one cheap existence probe, then skip redundant Ensure* SQL.
            if (SchemaPatchesNeeded(db))
            {
                EnsureAutoCheckoutColumns(db);
                EnsureReadableAssignmentNames(db);
                EnsureReadableIdentityNames(db);
                EnsureStaffJoinTablesMerged(db);
                EnsureConsolidatedStaffAuthSchema(db);
                EnsureSystemFlushLogTable(db);
                EnsurePaymentRecordTable(db);
                EnsureBookingChargeTable(db);
                EnsureBookingGuestHeadCountColumns(db);
                EnsureStaffShiftTable(db);
            }
        }
        catch (Exception ex) when (IsSqlConnectivityFailure(ex))
        {
            throw new InvalidOperationException(
                """
                Could not connect to SQL Server / LocalDB.

                This app expects LocalDB by default (see ConnectionStrings:DefaultConnection in appsettings.json).

                On a new Windows PC, install one of:
                  - SQL Server Express LocalDB (included with Visual Studio / Build Tools), or
                  - SQL Server Express / Developer Edition

                Then open a terminal and run:
                  sqllocaldb create mssqllocaldb
                  sqllocaldb start mssqllocaldb

                If you use a full SQL Server instance instead, update DefaultConnection, for example:
                  Server=localhost\\SQLEXPRESS;Database=HotelBookingDb;Trusted_Connection=True;TrustServerCertificate=True
                """,
                ex);
        }
        catch (Exception ex) when (IsMigrationSchemaConflict(ex))
        {
            throw new InvalidOperationException(
                """
                Database migration failed because HotelBookingDb is in an unexpected state.

                Safest fix on a new / demo machine (this deletes local hotel data):
                  1. sqllocaldb stop mssqllocaldb
                  2. Delete the LocalDB database folder files for HotelBookingDb, or run in SSMS / sqlcmd:
                       DROP DATABASE HotelBookingDb;
                  3. sqllocaldb start mssqllocaldb
                  4. Run the app again (it will recreate the schema).

                Or run:  powershell -File scripts/setup-new-device.ps1 -ResetDatabase
                """,
                ex);
        }
    }

    private static bool HasCurrentSchema(HotelBookingDbContext db)
    {
        try
        {
            var connection = db.Database.GetDbConnection();
            var shouldClose = connection.State != System.Data.ConnectionState.Open;
            if (shouldClose)
            {
                connection.Open();
            }

            try
            {
                using var command = connection.CreateCommand();
                command.CommandText =
                    """
                    SELECT CASE WHEN
                        OBJECT_ID(N'[dbo].[Room]', N'U') IS NOT NULL
                        AND OBJECT_ID(N'[dbo].[RoomType]', N'U') IS NOT NULL
                        AND COL_LENGTH(N'dbo.RoomType', N'Inclusions') IS NOT NULL
                        AND COL_LENGTH(N'dbo.RoomType', N'Description') IS NOT NULL
                        AND COL_LENGTH(N'dbo.RoomType', N'CreatedAt') IS NOT NULL
                        AND COL_LENGTH(N'dbo.RoomType', N'Images') IS NOT NULL
                        AND COL_LENGTH(N'dbo.Room', N'Inclusions') IS NULL
                    THEN 1 ELSE 0 END
                    """;
                var result = command.ExecuteScalar();
                return result is int i && i == 1
                       || result is long l && l == 1;
            }
            finally
            {
                if (shouldClose)
                {
                    connection.Close();
                }
            }
        }
        catch
        {
            return false;
        }
    }

    private const string BaselineMigrationId = "20260716150000_InitialCreate";

    private static bool HasBaselineMigration(HotelBookingDbContext db)
    {
        return db.Database.GetAppliedMigrations()
            .Any(id => id.Equals(BaselineMigrationId, StringComparison.Ordinal));
    }

    private static void StampBaselineHistory(HotelBookingDbContext db)
    {
        db.Database.ExecuteSqlRaw(
            """
            IF OBJECT_ID(N'[dbo].[__EFMigrationsHistory]', N'U') IS NULL
            BEGIN
                CREATE TABLE [__EFMigrationsHistory] (
                    [MigrationId] nvarchar(150) NOT NULL,
                    [ProductVersion] nvarchar(32) NOT NULL,
                    CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
                );
            END

            DELETE FROM [__EFMigrationsHistory];

            INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
            VALUES (N'20260716150000_InitialCreate', N'9.0.6');
            """);
    }

    private static void TryStartLocalDb(string? connectionString, ILogger? logger)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        if (!connectionString.Contains("localdb", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        try
        {
            var start = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "sqllocaldb",
                Arguments = "start mssqllocaldb",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var process = System.Diagnostics.Process.Start(start);
            process?.WaitForExit(15_000);
        }
        catch (Exception ex)
        {
            logger?.LogDebug(ex, "Could not auto-start LocalDB via sqllocaldb.");
        }
    }

    private static bool IsSqlConnectivityFailure(Exception ex)
    {
        for (var current = ex; current != null; current = current.InnerException!)
        {
            if (current is SqlException sql)
            {
                // -1 / 2 / 53: network / instance not found; 4060: cannot open database (ok to retry create)
                if (sql.Number is -1 or 2 or 53 or 40 or 233 or 18456)
                {
                    return true;
                }
            }

            var message = current.Message;
            if (message.Contains("Local Database Runtime", StringComparison.OrdinalIgnoreCase)
                || message.Contains("error occurred while establishing a connection", StringComparison.OrdinalIgnoreCase)
                || message.Contains("network-related", StringComparison.OrdinalIgnoreCase)
                || message.Contains("server was not found", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsMigrationSchemaConflict(Exception ex)
    {
        for (var current = ex; current != null; current = current.InnerException!)
        {
            var message = current.Message;
            if (message.Contains("already an object named", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Invalid object name", StringComparison.OrdinalIgnoreCase)
                || message.Contains("Unable to map all rooms", StringComparison.OrdinalIgnoreCase)
                || message.Contains("There is already an object", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static void EnsureAutoCheckoutColumns(HotelBookingDbContext db)
    {
        try
        {
            var connection = db.Database.GetDbConnection();
            var shouldClose = connection.State != System.Data.ConnectionState.Open;
            if (shouldClose)
            {
                connection.Open();
            }

            try
            {
                using var command = connection.CreateCommand();
                command.CommandText =
                    """
                    IF OBJECT_ID(N'[dbo].[Booking]', N'U') IS NOT NULL
                    BEGIN
                        IF COL_LENGTH(N'dbo.Booking', N'CheckInAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [CheckInAtUtc] datetime2 NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'CheckoutTimeUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [CheckoutTimeUtc] datetime2 NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'CheckIn') IS NOT NULL
                            EXEC(N'UPDATE [dbo].[Booking] SET [CheckInAtUtc] = CAST([CheckIn] AS datetime2) WHERE [CheckInAtUtc] IS NULL AND [CheckIn] IS NOT NULL;');

                        IF COL_LENGTH(N'dbo.Booking', N'CheckOut') IS NOT NULL
                            EXEC(N'UPDATE [dbo].[Booking] SET [CheckoutTimeUtc] = CAST([CheckOut] AS datetime2) WHERE [CheckoutTimeUtc] IS NULL AND [CheckOut] IS NOT NULL;');

                        UPDATE [dbo].[Booking] SET [CheckInAtUtc] = SYSUTCDATETIME() WHERE [CheckInAtUtc] IS NULL;
                        UPDATE [dbo].[Booking] SET [CheckoutTimeUtc] = DATEADD(day, 1, SYSUTCDATETIME()) WHERE [CheckoutTimeUtc] IS NULL;

                        IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Booking_IsArchived_Status_CheckIn_CheckOut' AND object_id = OBJECT_ID('dbo.Booking'))
                            DROP INDEX [IX_Booking_IsArchived_Status_CheckIn_CheckOut] ON [dbo].[Booking];

                        IF COL_LENGTH(N'dbo.Booking', N'CheckIn') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [CheckIn];

                        IF COL_LENGTH(N'dbo.Booking', N'CheckOut') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [CheckOut];

                        IF COL_LENGTH(N'dbo.Booking', N'CheckOutTime') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [CheckOutTime];

                        IF COL_LENGTH(N'dbo.Booking', N'AdminReadAtUtc') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [AdminReadAtUtc];

                        IF COL_LENGTH(N'dbo.Booking', N'CheckoutWarningSentAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [CheckoutWarningSentAtUtc] datetime2 NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'AutoCheckedOutAtUtc') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [AutoCheckedOutAtUtc];

                        IF COL_LENGTH(N'dbo.Booking', N'RowVersion') IS NOT NULL
                            ALTER TABLE [dbo].[Booking] DROP COLUMN [RowVersion];

                        IF COL_LENGTH(N'dbo.Booking', N'IsNotificationCleared') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [IsNotificationCleared] bit NOT NULL CONSTRAINT [DF_Booking_IsNotificationCleared] DEFAULT (0);

                        IF COL_LENGTH(N'dbo.Booking', N'ArrivalWarningSentAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [ArrivalWarningSentAtUtc] datetime2 NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'PendingCallWarningSentAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [PendingCallWarningSentAtUtc] datetime2 NULL;
                    END

                    IF OBJECT_ID(N'[dbo].[LegacyBooking]', N'U') IS NOT NULL
                        DROP TABLE [dbo].[LegacyBooking];

                    IF OBJECT_ID(N'[dbo].[RoomType]', N'U') IS NOT NULL
                    BEGIN
                        IF COL_LENGTH(N'dbo.RoomType', N'PricePerNight') IS NULL
                            ALTER TABLE [dbo].[RoomType] ADD [PricePerNight] decimal(18,2) NOT NULL DEFAULT 1500.00;

                        IF COL_LENGTH(N'dbo.RoomType', N'MaxOccupancy') IS NULL
                            ALTER TABLE [dbo].[RoomType] ADD [MaxOccupancy] int NOT NULL DEFAULT 2;

                        IF COL_LENGTH(N'dbo.RoomType', N'BedCount') IS NULL
                            ALTER TABLE [dbo].[RoomType] ADD [BedCount] int NOT NULL DEFAULT 1;

                        IF OBJECT_ID(N'[dbo].[Room]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Room', N'PricePerNight') IS NOT NULL
                        BEGIN
                            EXEC(N'
                                UPDATE rt
                                SET rt.PricePerNight = ISNULL(r.PricePerNight, 1500.00),
                                    rt.MaxOccupancy = ISNULL(r.MaxOccupancy, 2),
                                    rt.BedCount = ISNULL(r.BedCount, 1)
                                FROM [dbo].[RoomType] rt
                                OUTER APPLY (
                                    SELECT TOP 1 PricePerNight, MaxOccupancy, BedCount
                                    FROM [dbo].[Room] r
                                    WHERE r.RoomTypeID = rt.RoomTypeID
                                ) r;
                            ');

                            IF COL_LENGTH(N'dbo.Room', N'PricePerNight') IS NOT NULL
                                ALTER TABLE [dbo].[Room] DROP COLUMN [PricePerNight];

                            IF COL_LENGTH(N'dbo.Room', N'MaxOccupancy') IS NOT NULL
                                ALTER TABLE [dbo].[Room] DROP COLUMN [MaxOccupancy];

                            IF COL_LENGTH(N'dbo.Room', N'BedCount') IS NOT NULL
                                ALTER TABLE [dbo].[Room] DROP COLUMN [BedCount];
                        END
                    END
                    """;
                command.ExecuteNonQuery();
            }
            finally
            {
                if (shouldClose)
                {
                    connection.Close();
                }
            }
        }
        catch
        {
            // Ignore if columns exist or transient schema check
        }
    }

    /// <summary>
    /// Returns true when any post-migration patch target is still missing.
    /// Single round-trip so warm app starts avoid four Ensure* scripts.
    /// </summary>
    private static bool SchemaPatchesNeeded(HotelBookingDbContext db)
    {
        try
        {
            var connection = db.Database.GetDbConnection();
            var shouldClose = connection.State != System.Data.ConnectionState.Open;
            if (shouldClose)
            {
                connection.Open();
            }

            try
            {
                using var command = connection.CreateCommand();
                command.CommandText =
                    """
                    SELECT CASE WHEN
                        OBJECT_ID(N'[dbo].[Booking]', N'U') IS NULL
                        OR COL_LENGTH(N'dbo.Booking', N'IsNotificationCleared') IS NULL
                        OR COL_LENGTH(N'dbo.Booking', N'ArrivalWarningSentAtUtc') IS NULL
                        OR COL_LENGTH(N'dbo.Booking', N'PendingCallWarningSentAtUtc') IS NULL
                        OR COL_LENGTH(N'dbo.Booking', N'CheckoutWarningSentAtUtc') IS NULL
                        OR OBJECT_ID(N'[dbo].[PaymentRecord]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[BookingCharge]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[AssignedRoom]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[AspNetUsers]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffAccountRole]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffAccountClaim]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffRoleClaim]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffAccountAudit]', N'U') IS NOT NULL
                        OR OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                        OR COL_LENGTH(N'dbo.StaffUser', N'RoleId') IS NULL
                        OR COL_LENGTH(N'dbo.StaffAccount', N'RoleId') IS NULL
                        OR OBJECT_ID(N'[dbo].[SystemFlushLog]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[SystemAuditLog]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[StaffShift]', N'U') IS NULL
                    THEN 1 ELSE 0 END
                    """;
                var result = command.ExecuteScalar();
                return result is int i && i == 1
                       || result is long l && l == 1
                       || result is bool b && b;
            }
            finally
            {
                if (shouldClose)
                {
                    connection.Close();
                }
            }
        }
        catch
        {
            return true;
        }
    }

    /// <summary>
    /// Warm-start patch if EF history already looks current but AssignedRoom / RoomTypeID remain.
    /// </summary>
    private static void EnsureReadableAssignmentNames(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[AssignedRoom]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[BookingRoomAssignment]', N'U') IS NULL
                BEGIN
                    EXEC sp_rename N'[dbo].[AssignedRoom]', N'BookingRoomAssignment';
                    IF OBJECT_ID(N'[PK_AssignedRoom]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AssignedRoom', N'PK_BookingRoomAssignment', N'OBJECT';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AssignedRoom_BookingItemId_RoomId' AND object_id = OBJECT_ID(N'dbo.BookingRoomAssignment'))
                        EXEC sp_rename N'[dbo].[BookingRoomAssignment].[IX_AssignedRoom_BookingItemId_RoomId]', N'IX_BookingRoomAssignment_BookingItemId_RoomId', N'INDEX';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AssignedRoom_RoomId' AND object_id = OBJECT_ID(N'dbo.BookingRoomAssignment'))
                        EXEC sp_rename N'[dbo].[BookingRoomAssignment].[IX_AssignedRoom_RoomId]', N'IX_BookingRoomAssignment_RoomId', N'INDEX';
                END

                IF EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.RoomType')
                      AND name COLLATE Latin1_General_BIN = N'RoomTypeID')
                    EXEC sp_rename N'[dbo].[RoomType].[RoomTypeID]', N'RoomTypeId', N'COLUMN';

                IF EXISTS (
                    SELECT 1 FROM sys.columns
                    WHERE object_id = OBJECT_ID(N'dbo.Room')
                      AND name COLLATE Latin1_General_BIN = N'RoomTypeID')
                    EXEC sp_rename N'[dbo].[Room].[RoomTypeID]', N'RoomTypeId', N'COLUMN';
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    /// <summary>
    /// Warm-start patch if AspNet* Identity tables remain after the staff-account rename.
    /// </summary>
    private static void EnsureReadableIdentityNames(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[AspNetUsers]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NULL
                BEGIN
                    IF OBJECT_ID(N'[dbo].[FK_AspNetRoleClaims_AspNetRoles_RoleId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetRoleClaims] DROP CONSTRAINT [FK_AspNetRoleClaims_AspNetRoles_RoleId];
                    IF OBJECT_ID(N'[dbo].[FK_AspNetUserClaims_AspNetUsers_UserId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetUserClaims] DROP CONSTRAINT [FK_AspNetUserClaims_AspNetUsers_UserId];
                    IF OBJECT_ID(N'[dbo].[FK_AspNetUserLogins_AspNetUsers_UserId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetUserLogins] DROP CONSTRAINT [FK_AspNetUserLogins_AspNetUsers_UserId];
                    IF OBJECT_ID(N'[dbo].[FK_AspNetUserRoles_AspNetRoles_RoleId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetUserRoles] DROP CONSTRAINT [FK_AspNetUserRoles_AspNetRoles_RoleId];
                    IF OBJECT_ID(N'[dbo].[FK_AspNetUserRoles_AspNetUsers_UserId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetUserRoles] DROP CONSTRAINT [FK_AspNetUserRoles_AspNetUsers_UserId];
                    IF OBJECT_ID(N'[dbo].[FK_AspNetUserTokens_AspNetUsers_UserId]', N'F') IS NOT NULL
                        ALTER TABLE [dbo].[AspNetUserTokens] DROP CONSTRAINT [FK_AspNetUserTokens_AspNetUsers_UserId];

                    EXEC sp_rename N'[dbo].[AspNetRoles]', N'StaffRole';
                    EXEC sp_rename N'[dbo].[AspNetRoleClaims]', N'StaffRoleClaim';
                    EXEC sp_rename N'[dbo].[AspNetUsers]', N'StaffAccount';
                    EXEC sp_rename N'[dbo].[AspNetUserClaims]', N'StaffAccountClaim';
                    EXEC sp_rename N'[dbo].[AspNetUserLogins]', N'StaffAccountLogin';
                    EXEC sp_rename N'[dbo].[AspNetUserRoles]', N'StaffAccountRole';
                    EXEC sp_rename N'[dbo].[AspNetUserTokens]', N'StaffAccountToken';

                    IF OBJECT_ID(N'[PK_AspNetRoles]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetRoles', N'PK_StaffRole', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetRoleClaims]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetRoleClaims', N'PK_StaffRoleClaim', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetUsers]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetUsers', N'PK_StaffAccount', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetUserClaims]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetUserClaims', N'PK_StaffAccountClaim', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetUserLogins]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetUserLogins', N'PK_StaffAccountLogin', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetUserRoles]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetUserRoles', N'PK_StaffAccountRole', N'OBJECT';
                    IF OBJECT_ID(N'[PK_AspNetUserTokens]', N'PK') IS NOT NULL
                        EXEC sp_rename N'PK_AspNetUserTokens', N'PK_StaffAccountToken', N'OBJECT';

                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AspNetRoleClaims_RoleId' AND object_id = OBJECT_ID(N'dbo.StaffRoleClaim'))
                        EXEC sp_rename N'[dbo].[StaffRoleClaim].[IX_AspNetRoleClaims_RoleId]', N'IX_StaffRoleClaim_RoleId', N'INDEX';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AspNetUserClaims_UserId' AND object_id = OBJECT_ID(N'dbo.StaffAccountClaim'))
                        EXEC sp_rename N'[dbo].[StaffAccountClaim].[IX_AspNetUserClaims_UserId]', N'IX_StaffAccountClaim_UserId', N'INDEX';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AspNetUserLogins_UserId' AND object_id = OBJECT_ID(N'dbo.StaffAccountLogin'))
                        EXEC sp_rename N'[dbo].[StaffAccountLogin].[IX_AspNetUserLogins_UserId]', N'IX_StaffAccountLogin_UserId', N'INDEX';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AspNetUserRoles_RoleId' AND object_id = OBJECT_ID(N'dbo.StaffAccountRole'))
                        EXEC sp_rename N'[dbo].[StaffAccountRole].[IX_AspNetUserRoles_RoleId]', N'IX_StaffAccountRole_RoleId', N'INDEX';
                    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AspNetUsers_NormalizedGoogleEmail' AND object_id = OBJECT_ID(N'dbo.StaffAccount'))
                        EXEC sp_rename N'[dbo].[StaffAccount].[IX_AspNetUsers_NormalizedGoogleEmail]', N'IX_StaffAccount_NormalizedGoogleEmail', N'INDEX';

                    ALTER TABLE [dbo].[StaffRoleClaim] ADD CONSTRAINT [FK_StaffRoleClaim_StaffRole_RoleId]
                        FOREIGN KEY ([RoleId]) REFERENCES [dbo].[StaffRole] ([Id]) ON DELETE CASCADE;
                    ALTER TABLE [dbo].[StaffAccountClaim] ADD CONSTRAINT [FK_StaffAccountClaim_StaffAccount_UserId]
                        FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffAccount] ([Id]) ON DELETE CASCADE;
                    ALTER TABLE [dbo].[StaffAccountLogin] ADD CONSTRAINT [FK_StaffAccountLogin_StaffAccount_UserId]
                        FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffAccount] ([Id]) ON DELETE CASCADE;
                    ALTER TABLE [dbo].[StaffAccountRole] ADD CONSTRAINT [FK_StaffAccountRole_StaffRole_RoleId]
                        FOREIGN KEY ([RoleId]) REFERENCES [dbo].[StaffRole] ([Id]) ON DELETE CASCADE;
                    ALTER TABLE [dbo].[StaffAccountRole] ADD CONSTRAINT [FK_StaffAccountRole_StaffAccount_UserId]
                        FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffAccount] ([Id]) ON DELETE CASCADE;
                    ALTER TABLE [dbo].[StaffAccountToken] ADD CONSTRAINT [FK_StaffAccountToken_StaffAccount_UserId]
                        FOREIGN KEY ([UserId]) REFERENCES [dbo].[StaffAccount] ([Id]) ON DELETE CASCADE;
                END
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    /// <summary>
    /// Copies StaffAccountRole onto StaffAccount.RoleId, then drops unused join/claim/legacy tables.
    /// </summary>
    private static void EnsureStaffJoinTablesMerged(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffAccount', N'RoleId') IS NULL
                    ALTER TABLE [dbo].[StaffAccount] ADD [RoleId] nvarchar(450) NULL;

                IF OBJECT_ID(N'[dbo].[StaffAccountRole]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffAccount', N'RoleId') IS NOT NULL
                BEGIN
                    UPDATE a
                    SET a.[RoleId] = picked.[RoleId]
                    FROM [dbo].[StaffAccount] a
                    INNER JOIN (
                        SELECT [UserId], MIN([RoleId]) AS [RoleId]
                        FROM [dbo].[StaffAccountRole]
                        GROUP BY [UserId]
                    ) picked ON picked.[UserId] = a.[Id]
                    WHERE a.[RoleId] IS NULL;
                END

                IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffAccount', N'RoleId') IS NOT NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM sys.indexes
                        WHERE name = N'IX_StaffAccount_RoleId'
                          AND object_id = OBJECT_ID(N'dbo.StaffAccount'))
                    CREATE INDEX [IX_StaffAccount_RoleId] ON [dbo].[StaffAccount] ([RoleId]);

                IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffRole]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffAccount', N'RoleId') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[FK_StaffAccount_StaffRole_RoleId]', N'F') IS NULL
                    ALTER TABLE [dbo].[StaffAccount] WITH CHECK
                    ADD CONSTRAINT [FK_StaffAccount_StaffRole_RoleId]
                        FOREIGN KEY ([RoleId]) REFERENCES [dbo].[StaffRole] ([Id]) ON DELETE SET NULL;

                IF OBJECT_ID(N'[dbo].[StaffAccountRole]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffAccountRole];
                IF OBJECT_ID(N'[dbo].[StaffAccountClaim]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffAccountClaim];
                IF OBJECT_ID(N'[dbo].[StaffRoleClaim]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffRoleClaim];
                IF OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[StaffUser];
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    private static void EnsureSecureSettingTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[SecureSetting]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[SecureSetting] (
                        [Id] int NOT NULL IDENTITY,
                        [Key] nvarchar(80) NOT NULL,
                        [Ciphertext] nvarchar(max) NOT NULL,
                        [UpdatedUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_SecureSetting] PRIMARY KEY ([Id])
                    );
                    CREATE UNIQUE INDEX [IX_SecureSetting_Key]
                        ON [dbo].[SecureSetting] ([Key]);
                END
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    private static void EnsureStaffPasswordResetCodeTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[StaffPasswordResetCode]', N'U') IS NULL
                   AND OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[StaffPasswordResetCode] (
                        [Id] int NOT NULL IDENTITY,
                        [UserId] nvarchar(450) NOT NULL,
                        [NormalizedEmail] nvarchar(256) NOT NULL,
                        [CodeHash] nvarchar(128) NOT NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [ExpiresAtUtc] datetime2 NOT NULL,
                        [ConsumedAtUtc] datetime2 NULL,
                        [FailedAttempts] int NOT NULL DEFAULT 0,
                        CONSTRAINT [PK_StaffPasswordResetCode] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_StaffPasswordResetCode_UserId_CreatedAtUtc]
                        ON [dbo].[StaffPasswordResetCode] ([UserId], [CreatedAtUtc]);
                    CREATE INDEX [IX_StaffPasswordResetCode_NormalizedEmail_ExpiresAtUtc]
                        ON [dbo].[StaffPasswordResetCode] ([NormalizedEmail], [ExpiresAtUtc]);
                END
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    private static void EnsureConsolidatedStaffAuthSchema(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
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
                    DROP TABLE [dbo].[StaffAccountAudit];
                END

                IF OBJECT_ID(N'[dbo].[FK_StaffAccountLogin_StaffAccount_UserId]', N'F') IS NOT NULL
                    ALTER TABLE [dbo].[StaffAccountLogin] DROP CONSTRAINT [FK_StaffAccountLogin_StaffAccount_UserId];
                IF OBJECT_ID(N'[dbo].[FK_StaffAccountToken_StaffAccount_UserId]', N'F') IS NOT NULL
                    ALTER TABLE [dbo].[StaffAccountToken] DROP CONSTRAINT [FK_StaffAccountToken_StaffAccount_UserId];
                IF OBJECT_ID(N'[dbo].[FK_StaffAccount_StaffRole_RoleId]', N'F') IS NOT NULL
                    ALTER TABLE [dbo].[StaffAccount] DROP CONSTRAINT [FK_StaffAccount_StaffRole_RoleId];

                IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NULL
                    EXEC sp_rename N'[dbo].[StaffAccount]', N'StaffUser';
                IF OBJECT_ID(N'PK_StaffAccount', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccount', N'PK_StaffUser', N'OBJECT';

                IF OBJECT_ID(N'[dbo].[StaffAccountLogin]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffExternalLogin]', N'U') IS NULL
                    EXEC sp_rename N'[dbo].[StaffAccountLogin]', N'StaffExternalLogin';
                IF OBJECT_ID(N'PK_StaffAccountLogin', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccountLogin', N'PK_StaffExternalLogin', N'OBJECT';

                IF OBJECT_ID(N'[dbo].[StaffAccountToken]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffAuthToken]', N'U') IS NULL
                    EXEC sp_rename N'[dbo].[StaffAccountToken]', N'StaffAuthToken';
                IF OBJECT_ID(N'PK_StaffAccountToken', N'OBJECT') IS NOT NULL
                    EXEC sp_rename N'PK_StaffAccountToken', N'PK_StaffAuthToken', N'OBJECT';

                IF OBJECT_ID(N'[dbo].[StaffPasswordResetOtp]', N'U') IS NOT NULL
                   AND OBJECT_ID(N'[dbo].[StaffPasswordResetCode]', N'U') IS NULL
                BEGIN
                    EXEC sp_rename N'[dbo].[StaffPasswordResetOtp]', N'StaffPasswordResetCode';
                    IF OBJECT_ID(N'PK_StaffPasswordResetOtp', N'OBJECT') IS NOT NULL
                        EXEC sp_rename N'PK_StaffPasswordResetOtp', N'PK_StaffPasswordResetCode', N'OBJECT';
                END

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
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    private static void EnsureSystemAuditLogTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[SystemAuditLog]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[SystemAuditLog] (
                        [Id] bigint NOT NULL IDENTITY,
                        [AtUtc] datetime2 NOT NULL,
                        [Intent] nvarchar(40) NOT NULL,
                        [Domain] nvarchar(40) NOT NULL,
                        [Action] nvarchar(80) NOT NULL,
                        [ActorUserId] nvarchar(450) NOT NULL,
                        [ActorDisplayName] nvarchar(120) NOT NULL,
                        [TargetType] nvarchar(40) NOT NULL,
                        [TargetId] nvarchar(80) NOT NULL,
                        [TargetLabel] nvarchar(200) NOT NULL,
                        [Reason] nvarchar(500) NULL,
                        [Summary] nvarchar(500) NOT NULL,
                        CONSTRAINT [PK_SystemAuditLog] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_SystemAuditLog_AtUtc]
                        ON [dbo].[SystemAuditLog] ([AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_Intent_AtUtc]
                        ON [dbo].[SystemAuditLog] ([Intent], [AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_Domain_AtUtc]
                        ON [dbo].[SystemAuditLog] ([Domain], [AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_TargetType_TargetId]
                        ON [dbo].[SystemAuditLog] ([TargetType], [TargetId]);
                END
                """);
        }
        catch (Exception)
        {
            // Next EF migrate / explicit reset still applies the named migration.
        }
    }

    private static void EnsureStaffDashboardLayoutColumn(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[StaffUser]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffUser', N'DashboardLayoutJson') IS NULL
                    ALTER TABLE [dbo].[StaffUser] ADD [DashboardLayoutJson] nvarchar(max) NULL;
                ELSE IF OBJECT_ID(N'[dbo].[StaffAccount]', N'U') IS NOT NULL
                   AND COL_LENGTH(N'dbo.StaffAccount', N'DashboardLayoutJson') IS NULL
                    ALTER TABLE [dbo].[StaffAccount] ADD [DashboardLayoutJson] nvarchar(max) NULL;
                """);
        }
        catch (Exception)
        {
            // Next EF migrate still applies the named migration.
        }
    }

    private static void EnsureSystemFlushLogTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[SystemFlushLog]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[SystemFlushLog] (
                        [Id] int NOT NULL IDENTITY,
                        [Kind] nvarchar(40) NOT NULL,
                        [FlushedAtUtc] datetime2 NOT NULL,
                        [PerformedBy] nvarchar(120) NOT NULL,
                        [RecordCount] int NOT NULL,
                        [FileName] nvarchar(200) NOT NULL,
                        [Summary] nvarchar(2000) NOT NULL,
                        CONSTRAINT [PK_SystemFlushLog] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_SystemFlushLog_FlushedAtUtc]
                        ON [dbo].[SystemFlushLog] ([FlushedAtUtc]);
                    CREATE INDEX [IX_SystemFlushLog_Kind_FlushedAtUtc]
                        ON [dbo].[SystemFlushLog] ([Kind], [FlushedAtUtc]);
                END

                IF OBJECT_ID(N'[dbo].[BookingHistoryFlushLog]', N'U') IS NOT NULL
                BEGIN
                    INSERT INTO [dbo].[SystemFlushLog] ([Kind], [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                    SELECT N'BookingHistory', h.[FlushedAtUtc], h.[PerformedBy], h.[RecordCount], h.[FileName], h.[Summary]
                    FROM [dbo].[BookingHistoryFlushLog] h
                    WHERE NOT EXISTS (
                        SELECT 1 FROM [dbo].[SystemFlushLog] s
                        WHERE s.[Kind] = N'BookingHistory'
                          AND s.[FlushedAtUtc] = h.[FlushedAtUtc]
                          AND s.[FileName] = h.[FileName]);
                END

                IF OBJECT_ID(N'[dbo].[PaymentFlushLog]', N'U') IS NOT NULL
                BEGIN
                    INSERT INTO [dbo].[SystemFlushLog] ([Kind], [FlushedAtUtc], [PerformedBy], [RecordCount], [FileName], [Summary])
                    SELECT N'Payments', p.[FlushedAtUtc], p.[PerformedBy], p.[RecordCount], p.[FileName], p.[Summary]
                    FROM [dbo].[PaymentFlushLog] p
                    WHERE NOT EXISTS (
                        SELECT 1 FROM [dbo].[SystemFlushLog] s
                        WHERE s.[Kind] = N'Payments'
                          AND s.[FlushedAtUtc] = p.[FlushedAtUtc]
                          AND s.[FileName] = p.[FileName]);
                END
                """);
        }
        catch
        {
            // Next EF migrate still applies the named migration.
        }
    }

    private static void EnsurePaymentRecordTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[PaymentRecord]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[PaymentRecord] (
                        [Id] int NOT NULL IDENTITY,
                        [BookingId] int NOT NULL,
                        [ReceiptNumber] nvarchar(40) NOT NULL,
                        [EventType] nvarchar(30) NOT NULL,
                        [Method] nvarchar(30) NOT NULL,
                        [Amount] decimal(18,2) NOT NULL,
                        [StayTotalAtPosting] decimal(18,2) NOT NULL,
                        [BalanceAfter] decimal(18,2) NOT NULL,
                        [PaidAtUtc] datetime2 NOT NULL,
                        [ReceivedBy] nvarchar(120) NOT NULL,
                        [Notes] nvarchar(1000) NULL,
                        [Status] nvarchar(20) NOT NULL,
                        [ExternalReference] nvarchar(120) NULL,
                        [BankTransferReference] nvarchar(120) NULL,
                        [ReceiptImagePath] nvarchar(500) NULL,
                        [VoidedAtUtc] datetime2 NULL,
                        [VoidReason] nvarchar(500) NULL,
                        [VoidedBy] nvarchar(120) NULL,
                        CONSTRAINT [PK_PaymentRecord] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_PaymentRecord_Booking_BookingId]
                            FOREIGN KEY ([BookingId]) REFERENCES [dbo].[Booking] ([Id]) ON DELETE CASCADE
                    );
                    CREATE UNIQUE INDEX [IX_PaymentRecord_ReceiptNumber]
                        ON [dbo].[PaymentRecord] ([ReceiptNumber]);
                    CREATE INDEX [IX_PaymentRecord_PaidAtUtc]
                        ON [dbo].[PaymentRecord] ([PaidAtUtc]);
                    CREATE INDEX [IX_PaymentRecord_BookingId_PaidAtUtc]
                        ON [dbo].[PaymentRecord] ([BookingId], [PaidAtUtc]);
                END
                """);
        }
        catch
        {
            // Ignore if table exists or transient schema check
        }
    }

    private static void EnsureBookingChargeTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[BookingCharge]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[BookingCharge] (
                        [Id] int NOT NULL IDENTITY,
                        [BookingId] int NOT NULL,
                        [ChargeType] nvarchar(30) NOT NULL,
                        [Label] nvarchar(200) NOT NULL,
                        [Quantity] int NOT NULL,
                        [Nights] int NOT NULL,
                        [UnitAmount] decimal(18,2) NOT NULL,
                        [Amount] decimal(18,2) NOT NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_BookingCharge] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_BookingCharge_Booking_BookingId]
                            FOREIGN KEY ([BookingId]) REFERENCES [dbo].[Booking] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_BookingCharge_BookingId_ChargeType]
                        ON [dbo].[BookingCharge] ([BookingId], [ChargeType]);
                END
                """);
        }
        catch
        {
            // Ignore if table exists or transient schema check
        }
    }

    private static void EnsureBookingGuestHeadCountColumns(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF COL_LENGTH(N'dbo.Booking', N'AdultCount') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [AdultCount] int NOT NULL CONSTRAINT [DF_Booking_AdultCount] DEFAULT (0);
                IF COL_LENGTH(N'dbo.Booking', N'ChildCount') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [ChildCount] int NOT NULL CONSTRAINT [DF_Booking_ChildCount] DEFAULT (0);
                IF COL_LENGTH(N'dbo.Booking', N'GuestPartyJson') IS NULL
                    ALTER TABLE [dbo].[Booking] ADD [GuestPartyJson] nvarchar(4000) NULL;
                """);
        }
        catch
        {
            // Ignore if columns exist or transient schema check
        }
    }

    private static void EnsureStaffShiftTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'dbo.StaffShift', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[StaffShift] (
                        [Id] int NOT NULL IDENTITY,
                        [StaffUserId] nvarchar(450) NOT NULL,
                        [StaffDisplayName] nvarchar(120) NOT NULL,
                        [StartedAtUtc] datetime2 NOT NULL,
                        [EndedAtUtc] datetime2 NULL,
                        [OpeningNote] nvarchar(2000) NULL,
                        [ClosingNote] nvarchar(2000) NULL,
                        [RoomsBriefing] nvarchar(4000) NULL,
                        [GuestsBriefing] nvarchar(4000) NULL,
                        [OffersBriefing] nvarchar(4000) NULL,
                        [GainNotes] nvarchar(2000) NULL,
                        [ClosingSummaryJson] nvarchar(max) NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [UpdatedAtUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_StaffShift] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_StaffShift_StaffUserId_StartedAtUtc]
                        ON [dbo].[StaffShift] ([StaffUserId], [StartedAtUtc]);
                    CREATE INDEX [IX_StaffShift_EndedAtUtc]
                        ON [dbo].[StaffShift] ([EndedAtUtc]);
                    CREATE UNIQUE INDEX [IX_StaffShift_StaffUserId_Open]
                        ON [dbo].[StaffShift] ([StaffUserId])
                        WHERE [EndedAtUtc] IS NULL;
                END
                """);
        }
        catch
        {
            // Ignore if table exists or transient schema check
        }
    }
}
