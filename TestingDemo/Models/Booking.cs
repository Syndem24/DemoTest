namespace TestingDemo.Models;

public enum BookingStatus
{
    Pending = 0,
    Confirmed = 1,
    Rejected = 2,
    Cancelled = 3,
    CheckedOut = 4
}

public enum BookingKind
{
    Booking = 0,
    Reservation = 1
}

public enum PaymentOption
{
    Full = 0,
    Half = 1
}

public class Booking
{
    public int Id { get; set; }
    public string Reference { get; set; } = string.Empty;
    public string GuestName { get; set; } = string.Empty;
    public string GuestEmail { get; set; } = string.Empty;
    public string GuestPhone { get; set; } = string.Empty;
    public DateTime CheckInAtUtc { get; set; }
    public DateTime CheckoutTimeUtc { get; set; }
    public BookingKind Kind { get; set; }
    public PaymentOption PaymentOption { get; set; } = PaymentOption.Full;
    public BookingStatus Status { get; set; } = BookingStatus.Pending;
    public decimal TotalAmount { get; set; }
    public decimal AmountDueNow { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
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

    public ICollection<BookingItem> Items { get; set; } = new List<BookingItem>();
    public ICollection<BookingCharge> Charges { get; set; } = new List<BookingCharge>();
    public ICollection<PaymentRecord> PaymentRecords { get; set; } = new List<PaymentRecord>();
}

public class BookingItem
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    /// <summary>
    /// Nullable so room types can be removed from inventory while booking history keeps RoomTypeName.
    /// </summary>
    public int? RoomTypeId { get; set; }
    public string RoomTypeName { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal PricePerNight { get; set; }

    public Booking Booking { get; set; } = null!;
    public RoomType? RoomType { get; set; }
    public ICollection<AssignedRoom> AssignedRooms { get; set; } = new List<AssignedRoom>();
}

public class AssignedRoom
{
    public int Id { get; set; }
    public int BookingItemId { get; set; }
    public int RoomId { get; set; }

    public BookingItem BookingItem { get; set; } = null!;
    public Room Room { get; set; } = null!;
}
