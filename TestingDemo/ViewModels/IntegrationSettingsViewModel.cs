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

    [Display(Name = "Gemini nickname")]
    [StringLength(80)]
    public string? GeminiKeyName { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Groq API key")]
    public string? GroqApiKey { get; set; }

    public bool GroqConfigured { get; set; }

    [Display(Name = "Clear Groq API key")]
    public bool ClearGroqKey { get; set; }

    [Display(Name = "Groq nickname")]
    [StringLength(80)]
    public string? GroqKeyName { get; set; }

    [Display(Name = "Show Continue with Google on login")]
    public bool GoogleLoginEnabled { get; set; }

    [Display(Name = "Google Client ID")]
    [StringLength(256)]
    public string? GoogleClientId { get; set; }

    [DataType(DataType.Password)]
    [Display(Name = "Google Client Secret")]
    public string? GoogleClientSecret { get; set; }

    public bool GoogleClientSecretConfigured { get; set; }

    [Display(Name = "Clear Google Client Secret")]
    public bool ClearGoogleClientSecret { get; set; }

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

public sealed class VerifyResetOtpViewModel
{
    [Required]
    [EmailAddress]
    [Display(Name = "Email")]
    public string Email { get; set; } = string.Empty;

    [Required]
    [StringLength(6, MinimumLength = 6)]
    [RegularExpression(@"^\d{6}$", ErrorMessage = "Enter the 6-digit code from your email.")]
    [Display(Name = "Verification code")]
    public string Otp { get; set; } = string.Empty;

    /// <summary>Attempts left before the active code is cancelled (null = unknown / no active code).</summary>
    public int? RemainingAttempts { get; set; }
}

public sealed class ResetPasswordViewModel
{
    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [StringLength(100, MinimumLength = 12)]
    [Display(Name = "New password")]
    public string NewPassword { get; set; } = string.Empty;

    [Required, DataType(DataType.Password)]
    [Display(Name = "Confirm password")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}
