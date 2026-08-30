namespace TestingDemo.ViewModels;

public sealed class AdminUserListViewModel
{
    public IReadOnlyList<AdminUserListItemViewModel> Users { get; init; } = Array.Empty<AdminUserListItemViewModel>();
    public int DeleteRetentionDays { get; init; }
    public string SearchTerm { get; init; } = string.Empty;
    public string SortBy { get; init; } = "name";
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
    public int TotalCount { get; init; }
    public int TotalPages { get; init; } = 1;
    public int AdminManagersCount { get; init; }
    public int ReceptionistsCount { get; init; }

    public bool HasPreviousPage => Page > 1;
    public bool HasNextPage => Page < TotalPages;
}

public sealed class AdminUserListItemViewModel
{
    public string Id { get; init; } = string.Empty;
    public string? FullName { get; init; }
    public string UserName { get; init; } = string.Empty;
    public string Email { get; init; } = string.Empty;
    public string? PhoneNumber { get; init; }
    public DateOnly? BirthDate { get; init; }
    public string? Address { get; init; }
    public string Role { get; init; } = "Unassigned";
    public bool IsDisabled { get; init; }
    public DateTime? DisabledAtUtc { get; init; }
    public bool CanDeleteNow { get; init; }
}
