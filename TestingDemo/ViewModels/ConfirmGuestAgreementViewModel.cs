namespace TestingDemo.ViewModels;

public sealed class ConfirmGuestAgreementViewModel
{
    public string Email { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? ReturnUrl { get; set; }
    public bool RememberMe { get; set; }
    public bool AcceptedTerms { get; set; }
}
