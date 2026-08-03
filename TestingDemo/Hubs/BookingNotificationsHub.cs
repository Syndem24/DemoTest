using Microsoft.AspNetCore.SignalR;
using TestingDemo.DTOs;

namespace TestingDemo.Hubs;

public interface IBookingNotificationsClient
{
    Task BookingCreated(BookingNotificationDto notification);
    Task BookingUpdated(BookingNotificationDto notification);
    Task BookingArchived(int bookingId);
}

public sealed class BookingNotificationsHub : Hub<IBookingNotificationsClient>
{
}
