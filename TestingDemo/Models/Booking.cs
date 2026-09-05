namespace TestingDemo.Models;

/// <summary>Lifecycle of a guest stay in <c>Booking.Status</c>.</summary>
public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    Rejected = 2,
    Cancelled = 3,
    CheckedOut = 4
}

/// <summary>How far ahead the stay was created: same-day booking vs future reservation.</summary>
public enum BookingKind
{
    Booking = 0,
    Reservation = 1
}

/// <summary>How much of <see cref="Booking.TotalAmount"/> is due when the guest books.</summary>
public enum PaymentOption
{
    Full = 0,
    Half = 1
}

/// <summary>
/// Table <c>Booking</c> — one guest stay (online, walk-in, or OTA).
/// Dates are stored UTC; display uses Philippines time.
/// </summary>
public class Booking
{
    /// <summary>Primary key.</summary>
    public int Id { get; set; }
    /// <summary>Public confirmation code (unique).</summary>
    public string Reference { get; set; } = string.Empty;
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    /// <summary>Scheduled arrival instant (UTC).</summary>
    public DateTime CheckInAtUtc { get; set; }
    /// <summary>Scheduled departure instant (UTC).</summary>
    public DateTime CheckoutTimeUtc { get; set; }
    public BookingKind Kind { get; set; }
    public PaymentOption PaymentOption { get; set; } = PaymentOption.Full;
    public BookingStatus Status { get; set; } = BookingStatus.Pending;
    /// <summary>Stay total including room nights and charges.</summary>
    public decimal TotalAmount { get; set; }
    /// <summary>Amount required at booking (full or half of total).</summary>
    public decimal AmountDueNow { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    /// <summary>True when moved to admin history (not deleted).</summary>
    public bool IsArchived { get; set; }
    public DateTime? ArchivedAtUtc { get; set; }
    /// <summary>
    /// When true, this booking is hidden from the admin notification bell until a new update resurfaces it.
    /// </summary>
    public bool IsNotificationCleared { get; set; }

    /// <summary>
    /// Set when the 20-minute arrival warning was surfaced so clear/dismiss can stick during the window.
    /// </summary>
    public DateTime? ArrivalWarningSentAtUtc { get; set; }

    /// <summary>
    /// Set when the pending call-guest warning (check-in − 20m) was surfaced.
    /// </summary>
    public DateTime? PendingCallWarningSentAtUtc { get; set; }

    /// <summary>
    /// Set when the checkout call warning (checkout − 20m) was surfaced.
    /// </summary>
    public DateTime? CheckoutWarningSentAtUtc { get; set; }

    public BookingChannel Channel { get; set; } = BookingChannel.Online;
    public int? SpecialOfferId { get; set; }
    public ArrivalDiscountRequest ArrivalDiscountRequest { get; set; } = ArrivalDiscountRequest.None;
    /// <summary>When true, payments must be Cash (walk-in LimitedTime promo).</summary>
    public bool CashOnlyPromo { get; set; }

    /// <summary>Total adults across the stay (receptionist / guest head count).</summary>
    public int AdultCount { get; set; }
    /// <summary>Total children under 12 across the stay.</summary>
    public int ChildCount { get; set; }
    /// <summary>JSON array of per-room head counts: [{"adults":2,"children":0},…].</summary>
    public string? GuestPartyJson { get; set; }

    public SpecialOffer? SpecialOffer { get; set; }
    public ICollection<BookingItem> Items { get; set; } = new List<BookingItem>();
    public ICollection<BookingCharge> Charges { get; set; } = new List<BookingCharge>();
    public ICollection<PaymentRecord> PaymentRecords { get; set; } = new List<PaymentRecord>();
}

/// <summary>
/// Table <c>BookingItem</c> — one room-type line on a stay (qty × nightly rate).
/// Physical room numbers live in <see cref="BookingRoomAssignment"/>.
/// </summary>
public class BookingItem
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    /// <summary>
    /// Nullable so room types can be removed from inventory while booking history keeps RoomTypeName.
    /// </summary>
    public int? RoomTypeId { get; set; }
    /// <summary>Snapshot of the room-type name at booking time.</summary>
    public string RoomTypeName { get; set; } = string.Empty;
    /// <summary>How many rooms of this type are on the stay.</summary>
    public int Quantity { get; set; }
    /// <summary>Nightly rate used for this line (promo or regular).</summary>
    public decimal PricePerNight { get; set; }

    public Booking Booking { get; set; } = null!;
    public RoomType? RoomType { get; set; }
    public ICollection<BookingRoomAssignment> RoomAssignments { get; set; } = new List<BookingRoomAssignment>();
}

/// <summary>
/// Table <c>BookingRoomAssignment</c> — links one physical <see cref="Room"/> to a
/// <see cref="BookingItem"/> after reception assigns room numbers. Not a room inventory row.
/// </summary>
public class BookingRoomAssignment
{
    public int Id { get; set; }
    /// <summary>The stay line this assignment belongs to.</summary>
    public int BookingItemId { get; set; }
    /// <summary>The physical room given to the guest.</summary>
    public int RoomId { get; set; }

    public BookingItem BookingItem { get; set; } = null!;
    public Room Room { get; set; } = null!;
}
