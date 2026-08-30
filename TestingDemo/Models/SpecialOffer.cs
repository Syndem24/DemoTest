namespace TestingDemo.Models;

public enum SpecialOfferKind
{
    LimitedTime = 0,
    /// <summary>Legacy — no longer creatable in admin.</summary>
    BestAvailableRate = 1,
    /// <summary>Legacy — no longer creatable in admin.</summary>
    BookNowStayLater = 2,
    StayLongerSaveMore = 3,
    /// <summary>Legacy — no longer creatable in admin.</summary>
    MonthlyStay = 4
}

/// <summary>Where the booking was sourced.</summary>
public enum BookingChannel
{
    Online = 0,
    WalkIn = 1,
    FrontDeskExtension = 2,
    Agoda = 3,
    Expedia = 4,
    RedDoorz = 5,
    OtherThirdParty = 6
}

/// <summary>Guest intent to claim Senior/PWD at arrival (ID verified at front desk).</summary>
public enum ArrivalDiscountRequest
{
    None = 0,
    SeniorCitizen = 1,
    Pwd = 2
}

[Flags]
public enum SpecialOfferChannels
{
    None = 0,
    OnlineVisible = 1,
    WalkIn = 2,
    FrontDesk = 4,
    /// <summary>Third-party OTAs never get walk-in LimitedTime promo; flag reserved for visibility only.</summary>
    ThirdPartyVisible = 8
}

/// <summary>
/// Table <c>SpecialOffer</c> — promo rate for one <see cref="RoomType"/> (Limited Time or Stay Longer).
/// Sibling rows share the same campaign title across room types.
/// </summary>
public class SpecialOffer
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }
    public SpecialOfferKind Kind { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    /// <summary>Shown as “was” / regular comparison price.</summary>
    public decimal RegularPricePerNight { get; set; }
    /// <summary>Promo nightly rate when applicable; null for informational kinds.</summary>
    public decimal? PromoPricePerNight { get; set; }
    /// <summary>Minimum stay nights for StayLongerSaveMore; null for Limited Time.</summary>
    public int? MinNights { get; set; }
    public SpecialOfferChannels Channels { get; set; }
        = SpecialOfferChannels.OnlineVisible | SpecialOfferChannels.WalkIn;
    /// <summary>When true, stay payments must be cash.</summary>
    public bool CashOnly { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public RoomType RoomType { get; set; } = null!;
}
