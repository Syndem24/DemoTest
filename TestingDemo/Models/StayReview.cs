namespace TestingDemo.Models;

/// <summary>
/// Table <c>StayReview</c> — one verified post-checkout review per booking.
/// Linked by booking ownership (guest email) and published for the public site.
/// </summary>
public class StayReview
{
    public int Id { get; set; }

    public int BookingId { get; set; }

    /// <summary>ASP.NET Identity user id of the guest who wrote the review.</summary>
    public string GuestUserId { get; set; } = string.Empty;

    /// <summary>Public display name (first name / short label), not full email.</summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>Overall stay score 1–5.</summary>
    public byte OverallRating { get; set; }

    /// <summary>Staff / service score 1–5.</summary>
    public byte StaffRating { get; set; }

    /// <summary>Comfort score 1–5.</summary>
    public byte ComfortRating { get; set; }

    /// <summary>Facilities / amenities score 1–5.</summary>
    public byte FacilitiesRating { get; set; }

    /// <summary>Optional NPS-style recommend flag.</summary>
    public bool? WouldRecommend { get; set; }

    /// <summary>Optional free-text comment.</summary>
    public string? Comment { get; set; }

    /// <summary>JSON string array of theme tags.</summary>
    public string? TagsJson { get; set; }

    /// <summary>When false, hidden from the public site (admin moderation).</summary>
    public bool IsPublished { get; set; } = true;

    /// <summary>Optional hotel/admin reply shown under the public review.</summary>
    public string? HotelReply { get; set; }
    public DateTime? HotelReplyAtUtc { get; set; }
    public string? HotelReplyBy { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    public Booking Booking { get; set; } = null!;
}
