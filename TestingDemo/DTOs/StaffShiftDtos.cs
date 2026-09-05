using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class StartStaffShiftRequest
{
    public string? OpeningNote { get; set; }
}

public class UpdateStaffShiftBriefingRequest
{
    public string? OpeningNote { get; set; }
    public string? ClosingNote { get; set; }
    public string? RoomsBriefing { get; set; }
    public string? GuestsBriefing { get; set; }
    public string? OffersBriefing { get; set; }
    public string? GainNotes { get; set; }
}

public class EndStaffShiftRequest : UpdateStaffShiftBriefingRequest
{
}

public sealed record StaffShiftGainDto(
    decimal Cash,
    decimal EWallet,
    decimal BankTransfer,
    decimal Other,
    decimal TotalCollected,
    decimal TotalRefunded,
    int PaymentCount);

public sealed record StaffShiftOpsDto(
    int BookingsCreated,
    int BookingsConfirmed,
    int BookingsCheckedOut,
    int BookingsCancelled,
    int RoomsNeedingAssign,
    int ArrivalsToday,
    int DeparturesToday,
    int ActiveOffers,
    int OffersTouchedInWindow,
    IReadOnlyList<string> ActiveOfferTitles);

public sealed record StaffShiftDto(
    int Id,
    string StaffUserId,
    string StaffDisplayName,
    DateTime StartedAtUtc,
    DateTime? EndedAtUtc,
    bool IsOpen,
    string? OpeningNote,
    string? ClosingNote,
    string? RoomsBriefing,
    string? GuestsBriefing,
    string? OffersBriefing,
    string? GainNotes,
    StaffShiftGainDto Gain,
    StaffShiftOpsDto Ops);

public sealed record StaffShiftPageDto(
    StaffShiftDto? Current,
    /// <summary>Most recently ended desk shift (any staff) — for the next handover to read.</summary>
    StaffShiftDto? LastHandover,
    IReadOnlyList<StaffShiftDto> Recent,
    int RecentTotal,
    int RecentPage,
    int RecentPageSize,
    StaffShiftOpsDto LiveHotel);
