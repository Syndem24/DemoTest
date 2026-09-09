using System.ComponentModel.DataAnnotations;

namespace TestingDemo.ViewModels;

public sealed class ChangePasswordViewModel
{
    /// <summary>Required when changing an existing password; unused when setting the first password.</summary>
    [DataType(DataType.Password)]
    [Display(Name = "Current password")]
    public string? CurrentPassword { get; set; }

    [Required, DataType(DataType.Password)]
    [StringLength(100, MinimumLength = 8)]
    [Display(Name = "New password")]
    public string NewPassword { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [Display(Name = "Confirm new password")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;

    /// <summary>Google / account email shown read-only on first-time guest setup.</summary>
    [Display(Name = "Email")]
    public string? Email { get; set; }

    /// <summary>Editable hotel username on first-time guest setup. Email stays fixed.</summary>
    [Display(Name = "Username")]
    [StringLength(64, MinimumLength = 3)]
    [RegularExpression(@"^[a-zA-Z0-9._-]+$", ErrorMessage = "Username may only use letters, numbers, dots, underscores, and hyphens.")]
    public string? UserName { get; set; }

    /// <summary>True when the account has no PasswordHash yet (AddPassword).</summary>
    public bool IsFirstPasswordSetup { get; set; }
}
