using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IRoomService
{
    Task<IReadOnlyList<RoomDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<RoomDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default);
    Task<RoomDto> CreateAsync(CreateRoomDto dto, CancellationToken cancellationToken = default);
    Task<int> CreateBulkAsync(CreateRoomsDto dto, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<string>> GetAvailableRoomNumbersAsync(CancellationToken cancellationToken = default);
    Task<RoomDto?> UpdateAsync(UpdateRoomDto dto, CancellationToken cancellationToken = default);
    Task<int> UpdateRoomTypeAsync(UpdateRoomTypeDto dto, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default);
    Task<int> DeleteRoomTypeAsync(int roomTypeId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Opens (Available) or closes (Cleaning / maintaining) a vacant room.
    /// Occupied rooms cannot be toggled.
    /// </summary>
    Task<RoomDto?> SetGuestReadyAsync(int id, bool open, CancellationToken cancellationToken = default);
}
