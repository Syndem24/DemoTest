using TestingDemo.Models;

namespace TestingDemo.DTOs;

public sealed class StayReviewWriteRequest
{
    public int BookingId { get; set; }
    public byte OverallRating { get; set; }
    public byte StaffRating { get; set; }
    public byte ComfortRating { get; set; }
    public byte FacilitiesRating { get; set; }
    public bool? WouldRecommend { get; set; }
    public string? Comment { get; set; }
    public IReadOnlyList<string>? Tags { get; set; }
}

public sealed record StayReviewPublicDto(
    int Id,
    string DisplayName,
    byte OverallRating,
    byte StaffRating,
    byte ComfortRating,
    byte FacilitiesRating,
    bool? WouldRecommend,
    string? Comment,
    IReadOnlyList<string> Tags,
    DateTime CreatedAtUtc,
    string? BookingReference,
    string? HotelReply,
    DateTime? HotelReplyAtUtc);

public sealed record StayReviewMineDto(
    int Id,
    int BookingId,
    string BookingReference,
    DateTime CheckoutAtUtc,
    byte OverallRating,
    byte StaffRating,
    byte ComfortRating,
    byte FacilitiesRating,
    bool? WouldRecommend,
    string? Comment,
    IReadOnlyList<string> Tags,
    bool CanEdit,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

public sealed record StayReviewEligibleStayDto(
    int BookingId,
    string Reference,
    DateTime CheckInAtUtc,
    DateTime CheckoutAtUtc,
    string GuestName);

public sealed record StayReviewPublicPageDto(
    double AverageOverall,
    int ReviewCount,
    IReadOnlyList<StayReviewPublicDto> Items);

public sealed record StayReviewPortalPageDto(
    IReadOnlyList<StayReviewEligibleStayDto> Eligible,
    IReadOnlyList<StayReviewMineDto> Mine);

public sealed record AdminStayReviewDto(
    int Id,
    int BookingId,
    string BookingReference,
    string GuestDisplayName,
    byte OverallRating,
    byte StaffRating,
    byte ComfortRating,
    byte FacilitiesRating,
    string? Comment,
    IReadOnlyList<string> Tags,
    bool IsPublished,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    string? HotelReply,
    DateTime? HotelReplyAtUtc,
    string? HotelReplyBy);

public sealed record AdminStayReviewListItemDto(
    int Id,
    string BookingReference,
    string GuestDisplayName,
    byte OverallRating,
    bool IsPublished,
    DateTime CreatedAtUtc,
    string CommentPreview,
    bool HasHotelReply);

public sealed record AdminStayReviewPageDto(
    IReadOnlyList<AdminStayReviewListItemDto> Items,
    int Total,
    int Page,
    int PageSize);

public sealed class UpdateStayReviewPublishRequest
{
    public bool IsPublished { get; set; }
}

public sealed class UpsertStayReviewReplyRequest
{
    public string? Reply { get; set; }
}
