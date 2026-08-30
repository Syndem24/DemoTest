using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface ISystemFlushService
{
    Task<IReadOnlyList<SystemFlushLogDto>> GetLogsAsync(
        SystemFlushKind? kind,
        CancellationToken cancellationToken = default);

    Task<SystemFlushPendingCountsDto> GetPendingCountsAsync(
        CancellationToken cancellationToken = default);

    Task<FlushSystemLogsResult> FlushSelectedAsync(
        IReadOnlyList<SystemFlushKind> kinds,
        string performedBy,
        CancellationToken cancellationToken = default);
}
