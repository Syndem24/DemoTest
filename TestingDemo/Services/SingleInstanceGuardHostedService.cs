using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace TestingDemo.Services;

/// <summary>
/// Mori is one app process + one SQL Server. Session, rate limits, SignalR, receipt files,
/// and background jobs are in-process — a second instance would duplicate work and split state.
/// This guard takes a SQL application lock for the process lifetime.
/// </summary>
public sealed class HostingOptions
{
    public const string SectionName = "Hosting";

    /// <summary>When true (default), refuse to start if another instance already holds the lock.</summary>
    public bool EnforceSingleInstance { get; set; } = true;
}

public sealed class SingleInstanceGuardHostedService : IHostedService, IAsyncDisposable
{
    public const string LockResourceName = "MoriInternationalHotel.SingleInstance";

    private readonly IConfiguration _configuration;
    private readonly IOptions<HostingOptions> _options;
    private readonly IHostApplicationLifetime _lifetime;
    private readonly ILogger<SingleInstanceGuardHostedService> _logger;
    private SqlConnection? _connection;
    private bool _holdsLock;

    public SingleInstanceGuardHostedService(
        IConfiguration configuration,
        IOptions<HostingOptions> options,
        IHostApplicationLifetime lifetime,
        ILogger<SingleInstanceGuardHostedService> logger)
    {
        _configuration = configuration;
        _options = options;
        _lifetime = lifetime;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_options.Value.EnforceSingleInstance)
        {
            _logger.LogWarning(
                "Hosting:EnforceSingleInstance is false. Multiple app instances are unsafe (session, jobs, SignalR, local uploads).");
            return;
        }

        var cs = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(cs))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:DefaultConnection is required for single-instance enforcement.");
        }

        _connection = new SqlConnection(cs);
        await _connection.OpenAsync(cancellationToken);

        await using var cmd = _connection.CreateCommand();
        cmd.CommandText = @"
DECLARE @result int;
EXEC @result = sp_getapplock
    @Resource = @resource,
    @LockMode = 'Exclusive',
    @LockOwner = 'Session',
    @LockTimeout = 0;
SELECT @result;";
        cmd.Parameters.AddWithValue("@resource", LockResourceName);
        var resultObj = await cmd.ExecuteScalarAsync(cancellationToken);
        var result = resultObj is int i ? i : Convert.ToInt32(resultObj);

        // 0 = granted, 1 = granted after wait. Negative = failure / timeout / deadlock.
        if (result < 0)
        {
            _logger.LogCritical(
                "Another Mori Hotel app instance already holds the single-instance lock ({Resource}). Stop the other process or set Hosting:EnforceSingleInstance=false only for deliberate local experiments.",
                LockResourceName);
            _lifetime.StopApplication();
            throw new InvalidOperationException(
                "Single-instance lock unavailable. Only one Mori Hotel app process may run against this database.");
        }

        _holdsLock = true;
        _logger.LogInformation(
            "Single-instance SQL applock acquired ({Resource}). Deploy exactly one app process.",
            LockResourceName);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_connection is null || !_holdsLock)
        {
            return;
        }

        try
        {
            await using var cmd = _connection.CreateCommand();
            cmd.CommandText = @"
EXEC sp_releaseapplock
    @Resource = @resource,
    @LockOwner = 'Session';";
            cmd.Parameters.AddWithValue("@resource", LockResourceName);
            await cmd.ExecuteNonQueryAsync(cancellationToken);
            _holdsLock = false;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Release of single-instance applock failed (connection may already be closed).");
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_connection is not null)
        {
            await _connection.DisposeAsync();
            _connection = null;
        }
    }
}
