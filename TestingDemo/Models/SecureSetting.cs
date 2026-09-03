namespace TestingDemo.Models;

public sealed class SecureSetting
{
    public int Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Ciphertext { get; set; } = string.Empty;
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}

public static class SecureSettingKeys
{
    public const string EmailSender = "EmailSettings.SenderEmail";
    public const string EmailPassword = "EmailSettings.Password";
    public const string GeminiApiKey = "Gemini.ApiKey";
    public const string GeminiKeyName = "Gemini.KeyName";
    public const string GoogleClientId = "Authentication.Google.ClientId";
    public const string GoogleClientSecret = "Authentication.Google.ClientSecret";
    public const string GoogleLoginEnabled = "Authentication.Google.LoginEnabled";
}
