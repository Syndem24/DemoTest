using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed record AuditActor(string UserId, string DisplayName);

public sealed record SystemAuditLogDto(
    long Id,
    DateTime AtUtc,
    SystemAuditIntent Intent,
    string IntentLabel,
    SystemAuditDomain Domain,
    string DomainLabel,
    string Action,
    string ActorUserId,
    string ActorDisplayName,
    string TargetType,
    string TargetId,
    string TargetLabel,
    string? Reason,
    string Summary);

public sealed record PagedSystemAuditLogsDto(
    IReadOnlyList<SystemAuditLogDto> Items,
    int Page,
    int PageSize,
    int Total);

public sealed record SystemAuditSuggestionDto(
    string Value,
    string Label,
    string Hint);
