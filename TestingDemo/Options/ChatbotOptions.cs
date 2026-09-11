namespace TestingDemo.Options;

public sealed class ChatbotOptions
{
    public const string SectionName = "Chatbot";

    /// <summary>Master kill switch. When false, API returns unknown-topic copy.</summary>
    public bool Enabled { get; set; }

    /// <summary>
    /// When true and a Gemini vault key exists, unmatched FAQ questions may call Gemini.
    /// Misses still return BuildUnknownTopicReply with UsedAiFallback false.
    /// </summary>
    public bool UseGeminiFallback { get; set; }

    public string AssistantName { get; set; } = "Mori Assistant";

    public string GeminiModel { get; set; } = "gemini-2.0-flash";

    public string GroqModel { get; set; } = "openai/gpt-oss-20b";

    public int MaxInputChars { get; set; } = 500;

    public int MaxOutputTokens { get; set; } = 320;

    public double Temperature { get; set; } = 0.3;

    public int MaxGeminiPerIpPerDay { get; set; } = 40;

    public int MaxLlmPerIpPerDay { get; set; } = 60;

    public int HistoryTurns { get; set; } = 8;

    public int ProviderCooldownMinutes { get; set; } = 30;

    public ChatbotPublicProfile PublicProfile { get; set; } = new();
}

public sealed class ChatbotPublicProfile
{
    public string HotelName { get; set; } = "Mori International Hotel";

    public string Address { get; set; } =
        "MCity Properties, A.S. Fortuna Street, Mandaue City, Cebu, Philippines";

    public string PhonePrimary { get; set; } = "+63 960 441 7525";

    public string PhoneSecondary { get; set; } = "(032) 238 8855";

    public string BookPath { get; set; } = "/Booking/Accommodations";

    /// <summary>Guest portal page for writing stay reviews (Google sign-in).</summary>
    public string ReviewsPath { get; set; } = "/GuestPortal/Reviews";

    public string CheckIn { get; set; } = "14:00";

    public string EarlyCheckIn { get; set; } = "11:30";

    public string CheckOut { get; set; } = "12:00";
}
