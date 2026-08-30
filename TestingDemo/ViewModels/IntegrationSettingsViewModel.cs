using System.ComponentModel.DataAnnotations;

namespace TestingDemo.ViewModels;

public sealed class IntegrationSettingsViewModel
{
    [EmailAddress]
    [Display(Name = "Gmail sender")]
    [StringLength(256)]
    public string? SenderEmail { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Gmail app password")]
    public string? SmtpPassword { get; set; }

    public bool SmtpPasswordConfigured { get; set; }

    [Display(Name = "Clear Gmail app password")]
    public bool ClearSmtpPassword { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Gemini API key")]
    public string? GeminiApiKey { get; set; }

    public bool GeminiConfigured { get; set; }

    [Display(Name = "Clear Gemini API key")]
    public bool ClearGeminiKey { get; set; }

    [Display(Name = "Gemini key name")]
    [StringLength(80)]
    public string? GeminiKeyName { get; set; }

    [Required]
    [DataType(DataType.Password)]
    [Display(Name = "Current password")]
    public string CurrentPassword { get; set; } = string.Empty;
}

public sealed class ForgotPasswordViewModel
{
    [Required]
    [EmailAddress]
    [Display(Name = "Email")]
    public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordViewModel
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required]
    public string Code { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [StringLength(100, MinimumLength = 12)]
    [Display(Name = "New password")]
    public string NewPassword { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [Display(Name = "Confirm password")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}
