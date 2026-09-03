namespace TestingDemo.ViewModels;

public sealed class ConfirmStaffIdentityViewModel
{
    public string DisplayName { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string GoogleEmail { get; set; } = string.Empty;
    public string? ReturnUrl { get; set; }
}
