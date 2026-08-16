namespace TestingDemo.Models;

public enum BookingChargeType
{
    EarlyCheckIn = 0,
    LateCheckout = 1,
    ExtraPerson = 2,
    Incidental = 3,
    ServiceFee = 4,
    SnackBeverage = 5,
    /// <summary>Display/metadata for extended nights; amount excluded from TotalAmount fee sum.</summary>
    StayExtension = 6
}

public class BookingCharge
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public BookingChargeType ChargeType { get; set; }
    public string Label { get; set; } = string.Empty;
    /// <summary>Rooms (early), hours (late), or persons (extra).</summary>
    public int Quantity { get; set; }
    /// <summary>Nights multiplier for extra-person charges; otherwise 1.</summary>
    public int Nights { get; set; } = 1;
    public decimal UnitAmount { get; set; }
    public decimal Amount { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public Booking Booking { get; set; } = null!;
}
