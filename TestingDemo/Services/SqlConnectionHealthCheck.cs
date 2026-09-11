using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace TestingDemo.Services;

/// <summary>Pings SQL via the configured DefaultConnection (for /health).</summary>
public sealed class SqlConnectionHealthCheck : IHealthCheck
{
    private readonly IConfiguration _configuration;

    public SqlConnectionHealthCheck(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var cs = _configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(cs))
        {
            return HealthCheckResult.Unhealthy("ConnectionStrings:DefaultConnection is missing.");
        }

        try
        {
            await using var connection = new SqlConnection(cs);
            await connection.OpenAsync(cancellationToken);
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = "SELECT 1";
            _ = await cmd.ExecuteScalarAsync(cancellationToken);
            return HealthCheckResult.Healthy("SQL Server reachable.");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("SQL Server unreachable.", ex);
        }
    }
}
