namespace TestingDemo.Services;

public sealed class AzureDocumentIntelligenceOptions
{
    public const string SectionName = "AzureDocumentIntelligence";

    public bool Enabled { get; set; } = true;

    /// <summary>Azure Document Intelligence resource endpoint URL.</summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Prefer User Secrets / env vars over appsettings for production.</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Soft monthly page budget (F0 free tier is 500). Stay under to avoid hard Azure denies.
    /// </summary>
    public int MonthlyPageBudget { get; set; } = 480;
}
