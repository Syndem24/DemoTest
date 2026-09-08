using System.ComponentModel.DataAnnotations;
using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class SpecialOfferDto
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }
    public string RoomTypeName { get; set; } = string.Empty;
    public SpecialOfferKind Kind { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal RegularPricePerNight { get; set; }
    public decimal? PromoPricePerNight { get; set; }
    /// <summary>Required for Stay Longer Save More (e.g. 5 or 7 nights).</summary>
    public int? MinNights { get; set; }
    public SpecialOfferChannels Channels { get; set; }
    public bool CashOnly { get; set; }
    public bool IsActive { get; set; }
    public DateTime StartsAtUtc { get; set; }
    public DateTime EndsAtUtc { get; set; }
    public bool OpenEnded { get; set; }
    public bool IsCurrentlyActive { get; set; }
    /// <summary>Peso off the room type base when Kind is GoogleLoyalty.</summary>
    public decimal? DiscountAmount { get; set; }
    public LoyaltyApplyMode LoyaltyApplyMode { get; set; }
}

public sealed class RoomTypePriceOption
{
    public int RoomTypeId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal PricePerNight { get; set; }
}

public sealed class UpsertSpecialOfferRequest
{
    /// <summary>Room types included in this offer (one DB row per type).</summary>
    [MinLength(1, ErrorMessage = "Select at least one room type.")]
    public List<int> RoomTypeIds { get; set; } = [];

    /// <summary>First selected room type; kept for pricing helpers.</summary>
    public int RoomTypeId { get; set; }

    [Required]
    public SpecialOfferKind Kind { get; set; }

    [StringLength(160)]
    public string Title { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    /// <summary>Percent off each room type base (Limited Time / Stay Longer). Decimals OK (e.g. 25.50).</summary>
    [Range(typeof(decimal), "0.01", "99.99", ErrorMessage = "Discount must be between 0.01% and 99.99%.")]
    public decimal? DiscountPercent { get; set; }

    /// <summary>Fixed peso off each room type base (Loyalty Coupon), e.g. 240.</summary>
    [Display(Name = "Amount off")]
    [Range(typeof(decimal), "0.01", "999999.99", ErrorMessage = "Amount off must be at least ₱0.01.")]
    public decimal? DiscountAmount { get; set; }

    /// <summary>Loyalty Coupon cadence. Ignored for other kinds. Optional in the form; defaults to every night.</summary>
    [Display(Name = "When to deduct")]
    public LoyaltyApplyMode? LoyaltyApplyMode { get; set; }

    /// <summary>Minimum nights for Stay Longer Save More (e.g. 5 or 7).</summary>
    [Range(2, 365, ErrorMessage = "Minimum stay must be between 2 and 365 nights.")]
    public int? MinNights { get; set; }

    /// <summary>Filled from room type base on save; not edited in the admin form.</summary>
    public decimal RegularPricePerNight { get; set; }

    /// <summary>Derived from DiscountPercent × room type base for rate offers.</summary>
    public decimal? PromoPricePerNight { get; set; }

    public SpecialOfferChannels Channels { get; set; }
        = SpecialOfferChannels.OnlineVisible | SpecialOfferChannels.WalkIn;

    public bool CashOnly { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>No end date; stays live until staff deactivate it.</summary>
    public bool OpenEnded { get; set; }

    [Required]
    [DataType(DataType.DateTime)]
    [DisplayFormat(DataFormatString = "{0:yyyy-MM-ddTHH:mm}", ApplyFormatInEditMode = true)]
    public DateTime StartsAtUtc { get; set; }

    [DataType(DataType.DateTime)]
    [DisplayFormat(DataFormatString = "{0:yyyy-MM-ddTHH:mm}", ApplyFormatInEditMode = true)]
    public DateTime EndsAtUtc { get; set; }
}

public sealed class ReactivateSpecialOfferRequest
{
    [Required]
    [DataType(DataType.DateTime)]
    [DisplayFormat(DataFormatString = "{0:yyyy-MM-ddTHH:mm}", ApplyFormatInEditMode = true)]
    public DateTime StartsAtUtc { get; set; }

    [Required]
    [DataType(DataType.DateTime)]
    [DisplayFormat(DataFormatString = "{0:yyyy-MM-ddTHH:mm}", ApplyFormatInEditMode = true)]
    public DateTime EndsAtUtc { get; set; }
}

public sealed record SpecialOfferEndingSoonNotificationDto(
    string Title,
    SpecialOfferKind Kind,
    DateTime EndsAtUtc,
    int MinutesRemaining,
    IReadOnlyList<string> RoomTypes);
