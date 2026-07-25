using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class BookingPageViewModel
{
    public IReadOnlyList<RoomTypeSummaryViewModel> RoomTypes { get; set; } = Array.Empty<RoomTypeSummaryViewModel>();
    public IReadOnlyList<RoomDto> AvailableRooms { get; set; } = Array.Empty<RoomDto>();
}
