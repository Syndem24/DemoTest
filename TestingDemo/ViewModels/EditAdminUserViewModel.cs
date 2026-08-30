using System.ComponentModel.DataAnnotations;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public sealed class EditAdminUserViewModel
{
    [Required]
    public string Id { get; set; } = string.Empty;

    [Display(Name = "Full name")]
    [StringLength(120)]
    public string? FullName { get; set; }

    [Required]
    [Display(Name = "Username")]
    [StringLength(64, MinimumLength = 3)]
    public string UserName { get; set; } = string.Empty;

    [Required]
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
    [StringLength(300)]
    public string? Address { get; set; }

    [Required]
    [Display(Name = "Role")]
    public string Role { get; set; } = AppRoles.Receptionist;

    public bool IsDisabled { get; set; }
}
