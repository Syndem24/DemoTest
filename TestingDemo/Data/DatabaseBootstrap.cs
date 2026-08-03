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
            EnsureAutoCheckoutColumns(db);
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
                        IF COL_LENGTH(N'dbo.Booking', N'CheckOutTime') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [CheckOutTime] time NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'CheckoutWarningSentAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [CheckoutWarningSentAtUtc] datetime2 NULL;

                        IF COL_LENGTH(N'dbo.Booking', N'AutoCheckedOutAtUtc') IS NULL
                            ALTER TABLE [dbo].[Booking] ADD [AutoCheckedOutAtUtc] datetime2 NULL;
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
}
