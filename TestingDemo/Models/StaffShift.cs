namespace TestingDemo.Models;

/// <summary>
/// Table <c>StaffShift</c> — one front-desk work window per staff member.
/// Totals are derived from payments/bookings/offers in [StartedAtUtc, EndedAtUtc];
/// briefing text fields are staff-authored handover notes.
/// </summary>
public class StaffShift
{
    public int Id { get; set; }

    public string StaffUserId { get; set; } = string.Empty;
    public string StaffDisplayName { get; set; } = string.Empty;

    public DateTime StartedAtUtc { get; set; }
    public DateTime? EndedAtUtc { get; set; }

    public string? OpeningNote { get; set; }
    public string? ClosingNote { get; set; }

    /// <summary>Staff-written room / housekeeping / assignment notes for handover.</summary>
    public string? RoomsBriefing { get; set; }
    /// <summary>Staff-written guest / arrival / special-request notes.</summary>
    public string? GuestsBriefing { get; set; }
    /// <summary>Staff-written notes on offer launches or promo reminders.</summary>
    public string? OffersBriefing { get; set; }
    /// <summary>Optional note about cash float / unexplained variance.</summary>
    public string? GainNotes { get; set; }

    /// <summary>JSON snapshot of computed totals and live briefing counts at end (or last save).</summary>
    public string? ClosingSummaryJson { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
