using System.ComponentModel.DataAnnotations;

namespace TestingDemo.ViewModels;

public sealed class AccountSettingsViewModel
{
    public UpdateProfileViewModel Profile { get; init; } = new();
    public ChangePasswordViewModel Password { get; init; } = new();
    public string ActiveSection { get; init; } = "overview";
    public string RoleName { get; init; } = "Staff";

    /// <summary>True when the signed-in user is a guest (not staff).</summary>
    public bool IsGuestAccount { get; init; }
    public bool ShowGoogleStepUp { get; init; }
    public IReadOnlyList<AccountActivityItem> ActivityLog { get; init; } = [];
    public int ActivityPage { get; init; } = 1;
    public int ActivityPageSize { get; init; } = 15;
    public int ActivityTotal { get; init; }

    public int ActivityTotalPages =>
        ActivityTotal <= 0 ? 1 : (int)Math.Ceiling(ActivityTotal / (double)Math.Max(1, ActivityPageSize));
}

public sealed class AccountActivityItem
{
    public string Title { get; init; } = string.Empty;
    public string Detail { get; init; } = string.Empty;
    public string WhenLocal { get; init; } = string.Empty;
    public string WhenUtc { get; init; } = string.Empty;
}

public sealed class UpdateProfileViewModel
{
    [Display(Name = "Full name")]
    [StringLength(120)]
    public string? FullName { get; set; }

    [Required]
    [Display(Name = "Username")]
    [StringLength(64, MinimumLength = 3)]
    public string UserName { get; set; } = string.Empty;

    [EmailAddress]
    [Display(Name = "Email")]
    [StringLength(256)]
    public string Email { get; set; } = string.Empty;

    [Display(Name = "Phone number")]
    [Phone]
    [StringLength(32)]
    public string? PhoneNumber { get; set; }

    [Display(Name = "Birth date")]
    [DataType(DataType.Date)]
    public DateOnly? BirthDate { get; set; }

    [Display(Name = "Address")]
    [StringLength(200)]
    public string? Address { get; set; }

    [Display(Name = "Google recovery email")]
    [EmailAddress]
    [StringLength(256)]
    public string? GoogleEmail { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Current password")]
    public string? CurrentPassword { get; set; }
}

public sealed class UpdateGoogleRecoveryViewModel
{
    [Required]
    [Display(Name = "Google recovery email")]
    [EmailAddress]
    [StringLength(256)]
    public string? GoogleEmail { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Current password")]
    public string? CurrentPassword { get; set; }
}
