using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public sealed class RoomDetailsViewModel
{
    public required RoomDto Room { get; init; }
    public BookingDto? CurrentStay { get; init; }
}
