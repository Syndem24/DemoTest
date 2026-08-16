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

            // Warm starts: one cheap existence probe, then skip redundant Ensure* SQL.
            if (SchemaPatchesNeeded(db))
            {
                EnsureAutoCheckoutColumns(db);
                EnsureHistoryFlushLogTable(db);
                EnsurePaymentFlushLogTable(db);
                EnsurePaymentRecordTable(db);
                EnsureBookingChargeTable(db);
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
                        OR OBJECT_ID(N'[dbo].[BookingHistoryFlushLog]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[PaymentFlushLog]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[PaymentRecord]', N'U') IS NULL
                        OR OBJECT_ID(N'[dbo].[BookingCharge]', N'U') IS NULL
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

    private static void EnsureHistoryFlushLogTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[BookingHistoryFlushLog]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[BookingHistoryFlushLog] (
                        [Id] int NOT NULL IDENTITY,
                        [FlushedAtUtc] datetime2 NOT NULL,
                        [PerformedBy] nvarchar(120) NOT NULL,
                        [RecordCount] int NOT NULL,
                        [FileName] nvarchar(200) NOT NULL,
                        [Summary] nvarchar(2000) NOT NULL,
                        CONSTRAINT [PK_BookingHistoryFlushLog] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_BookingHistoryFlushLog_FlushedAtUtc]
                        ON [dbo].[BookingHistoryFlushLog] ([FlushedAtUtc]);
                END
                """);
        }
        catch
        {
            // Ignore if table exists or transient schema check
        }
    }

    private static void EnsurePaymentFlushLogTable(HotelBookingDbContext db)
    {
        try
        {
            db.Database.ExecuteSqlRaw(
                """
                IF OBJECT_ID(N'[dbo].[PaymentFlushLog]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[PaymentFlushLog] (
                        [Id] int NOT NULL IDENTITY,
                        [FlushedAtUtc] datetime2 NOT NULL,
                        [PerformedBy] nvarchar(120) NOT NULL,
                        [RecordCount] int NOT NULL,
                        [FileName] nvarchar(200) NOT NULL,
                        [Summary] nvarchar(2000) NOT NULL,
                        CONSTRAINT [PK_PaymentFlushLog] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_PaymentFlushLog_FlushedAtUtc]
                        ON [dbo].[PaymentFlushLog] ([FlushedAtUtc]);
                END
                """);
        }
        catch
        {
            // Ignore if table exists or transient schema check
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
}
