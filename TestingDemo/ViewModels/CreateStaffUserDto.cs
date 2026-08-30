using System.ComponentModel.DataAnnotations;

namespace TestingDemo.ViewModels;

/// <summary>
/// Create-user form binding. Never bind ApplicationUser directly (mass-assignment).
/// </summary>
public sealed class CreateStaffUserDto
{
    [Required, StringLength(120, MinimumLength = 2)]
    [Display(Name = "Full name")]
    public string FullName { get; set; } = string.Empty;

    [Required, StringLength(64, MinimumLength = 3)]
    [Display(Name = "Username")]
    public string UserName { get; set; } = string.Empty;

    /// <summary>Login email and Google verification address (same value).</summary>
    [Required, EmailAddress, StringLength(256)]
    [Display(Name = "Email")]
    public string LoginEmail { get; set; } = string.Empty;

    [Required, Phone, StringLength(32)]
    [Display(Name = "Phone number")]
    public string PhoneNumber { get; set; } = string.Empty;

    [Required]
    [DataType(DataType.Date)]
    [Display(Name = "Birth date")]
    public DateOnly BirthDate { get; set; }

    [Required, StringLength(300, MinimumLength = 5)]
    [Display(Name = "Address")]
    public string Address { get; set; } = string.Empty;

    [Required]
    [Display(Name = "Role")]
    public string Role { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [StringLength(100, MinimumLength = 12)]
    [Display(Name = "Temporary password")]
    public string TemporaryPassword { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [Display(Name = "Confirm temporary password")]
    [Compare(nameof(TemporaryPassword), ErrorMessage = "Temporary passwords do not match.")]
    public string ConfirmTemporaryPassword { get; set; } = string.Empty;

    /// <summary>Required when Role is AdminManager (step-up re-auth).</summary>
    [DataType(DataType.Password)]
    [Display(Name = "Confirm your password")]
    public string? CurrentAdminPassword { get; set; }
}
