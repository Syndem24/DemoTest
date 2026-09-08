using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class BookingPageViewModel
{
    public IReadOnlyList<RoomTypeSummaryViewModel> RoomTypes { get; set; } = Array.Empty<RoomTypeSummaryViewModel>();
    public IReadOnlyList<RoomDto> AvailableRooms { get; set; } = Array.Empty<RoomDto>();
    public double ReviewAverage { get; set; }
    public int ReviewCount { get; set; }
    public IReadOnlyList<StayReviewPublicDto> Reviews { get; set; } = Array.Empty<StayReviewPublicDto>();
    public bool GoogleGuestSignedIn { get; set; }
    public bool GoogleLoginEnabled { get; set; }
}
