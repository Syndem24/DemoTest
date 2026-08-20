using FluentValidation;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;

namespace TestingDemo.Services;

public class RoomService : IRoomService
{
    private readonly HotelBookingDbContext _db;
    private readonly IValidator<CreateRoomDto> _createValidator;
    private readonly IValidator<CreateRoomsDto> _createBulkValidator;
    private readonly IValidator<UpdateRoomDto> _updateValidator;
    private readonly IValidator<UpdateRoomTypeDto> _updateRoomTypeValidator;

    public RoomService(
        HotelBookingDbContext db,
        IValidator<CreateRoomDto> createValidator,
        IValidator<CreateRoomsDto> createBulkValidator,
        IValidator<UpdateRoomDto> updateValidator,
        IValidator<UpdateRoomTypeDto> updateRoomTypeValidator)
    {
        _db = db;
        _createValidator = createValidator;
        _createBulkValidator = createBulkValidator;
        _updateValidator = updateValidator;
        _updateRoomTypeValidator = updateRoomTypeValidator;
    }

    public async Task<IReadOnlyList<RoomDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var rooms = await _db.Rooms
            .AsNoTracking()
            .Include(r => r.RoomType)
            .OrderBy(r => r.RoomNumber)
            .ToListAsync(cancellationToken);

        return rooms.Select(r => r.ToDto()).ToList();
    }

    public async Task<RoomDto?> GetByIdAsync(int id, CancellationToken cancellationToken = default)
    {
        var room = await GetByIdWithDetailsAsync(id, cancellationToken);
        return room?.ToDto();
    }

    public async Task<RoomDto> CreateAsync(CreateRoomDto dto, CancellationToken cancellationToken = default)
    {
        await _createValidator.ValidateAndThrowAsync(dto, cancellationToken);

        if (await RoomNumberExistsAsync(dto.RoomNumber, cancellationToken: cancellationToken))
        {
            throw new InvalidOperationException($"Room number '{dto.RoomNumber}' already exists.");
        }

        var roomType = await GetOrCreateRoomTypeAsync(
            dto.Name,
            dto.Description,
            dto.Inclusions,
            Array.Empty<string>(),
            cancellationToken);

        var room = new Room
        {
            RoomTypeId = roomType.RoomTypeId,
            RoomNumber = dto.RoomNumber.Trim(),
            Status = RoomStatus.Available
        };

        _db.Rooms.Add(room);
        await _db.SaveChangesAsync(cancellationToken);

        var created = await GetByIdWithDetailsAsync(room.Id, cancellationToken);
        return created!.ToDto();
    }

    public async Task<int> CreateBulkAsync(CreateRoomsDto dto, CancellationToken cancellationToken = default)
    {
        await _createBulkValidator.ValidateAndThrowAsync(dto, cancellationToken);

        var normalizedNumbers = dto.RoomNumbers
            .Select(n => n.Trim())
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .ToList();

        var inclusions = RoomMappings.NormalizeInclusions(dto.Inclusions);
        var images = RoomMappings.NormalizeImages(dto.Images);

        foreach (var roomNumber in normalizedNumbers)
        {
            if (await RoomNumberExistsAsync(roomNumber, cancellationToken: cancellationToken))
            {
                throw new InvalidOperationException($"Room number '{roomNumber}' already exists.");
            }
        }

        var typeName = dto.Name.Trim();
        if (await TypeNameExistsAsync(typeName, cancellationToken: cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{typeName}' already exists.");
        }

        var roomType = new RoomType
        {
            Name = typeName,
            Description = dto.Description?.Trim(),
            PricePerNight = dto.PricePerNight,
            MaxOccupancy = dto.MaxOccupancy,
            BedCount = dto.BedCount,
            CreatedAt = DateTime.UtcNow,
            Inclusions = inclusions.ToList(),
            Images = images.ToList()
        };

        _db.RoomTypes.Add(roomType);
        await _db.SaveChangesAsync(cancellationToken);

        foreach (var roomNumber in normalizedNumbers)
        {
            _db.Rooms.Add(new Room
            {
                RoomTypeId = roomType.RoomTypeId,
                RoomNumber = roomNumber,
                Status = RoomStatus.Available
            });
        }

        await _db.SaveChangesAsync(cancellationToken);
        return normalizedNumbers.Count;
    }

    public async Task<IReadOnlyList<string>> GetAvailableRoomNumbersAsync(CancellationToken cancellationToken = default)
    {
        var existing = await _db.Rooms
            .AsNoTracking()
            .Select(r => r.RoomNumber)
            .ToListAsync(cancellationToken);

        var taken = new HashSet<string>(existing, StringComparer.OrdinalIgnoreCase);
        var available = new List<string>();

        for (var floor = 1; floor <= 9 && available.Count < 200; floor++)
        {
            for (var unit = 1; unit <= 99 && available.Count < 200; unit++)
            {
                var number = $"{floor}{unit:D2}";
                if (!taken.Contains(number))
                {
                    available.Add(number);
                }
            }
        }

        return available;
    }

    public async Task<RoomDto?> UpdateAsync(UpdateRoomDto dto, CancellationToken cancellationToken = default)
    {
        await _updateValidator.ValidateAndThrowAsync(dto, cancellationToken);

        var room = await GetByIdWithDetailsAsync(dto.Id, cancellationToken);
        if (room is null)
        {
            return null;
        }

        if (await RoomNumberExistsAsync(dto.RoomNumber, dto.Id, cancellationToken))
        {
            throw new InvalidOperationException($"Room number '{dto.RoomNumber}' already exists.");
        }

        var roomType = await _db.RoomTypes
            .Include(t => t.Rooms)
            .FirstOrDefaultAsync(t => t.RoomTypeId == dto.RoomTypeId, cancellationToken)
            ?? throw new InvalidOperationException("Room type not found.");

        if (await TypeNameExistsAsync(dto.Name, roomType.RoomTypeId, cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{dto.Name.Trim()}' already exists.");
        }

        roomType.Name = dto.Name.Trim();
        roomType.Description = dto.Description?.Trim();
        roomType.PricePerNight = dto.PricePerNight;
        roomType.MaxOccupancy = dto.MaxOccupancy;
        roomType.BedCount = dto.BedCount;
        roomType.Inclusions = RoomMappings.NormalizeInclusions(dto.Inclusions);
        _db.Entry(roomType).Property(t => t.Inclusions).IsModified = true;

        room.RoomNumber = dto.RoomNumber.Trim();
        room.Status = RoomStatus.Available;

        await _db.SaveChangesAsync(cancellationToken);

        var updated = await GetByIdWithDetailsAsync(room.Id, cancellationToken);
        return updated!.ToDto();
    }

    public async Task<int> UpdateRoomTypeAsync(
        UpdateRoomTypeDto dto,
        CancellationToken cancellationToken = default)
    {
        await _updateRoomTypeValidator.ValidateAndThrowAsync(dto, cancellationToken);

        var roomType = await _db.RoomTypes
            .Include(t => t.Rooms)
            .FirstOrDefaultAsync(t => t.RoomTypeId == dto.RoomTypeId, cancellationToken);
        if (roomType is null)
        {
            return 0;
        }

        if (await TypeNameExistsAsync(dto.Name, dto.RoomTypeId, cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{dto.Name.Trim()}' already exists.");
        }

        roomType.Name = dto.Name.Trim();
        roomType.Description = dto.Description?.Trim();
        roomType.PricePerNight = dto.PricePerNight;
        roomType.MaxOccupancy = dto.MaxOccupancy;
        roomType.BedCount = dto.BedCount;
        roomType.Inclusions = RoomMappings.NormalizeInclusions(dto.Inclusions);
        roomType.Images = RoomMappings.NormalizeImages(dto.Images);
        _db.Entry(roomType).Property(t => t.Inclusions).IsModified = true;
        _db.Entry(roomType).Property(t => t.Images).IsModified = true;

        var existingRooms = await _db.Rooms
            .Include(r => r.RoomType)
            .Where(r => r.RoomTypeId == dto.RoomTypeId)
            .OrderBy(r => r.RoomNumber)
            .ToListAsync(cancellationToken);

        var keptIds = dto.RoomNumbers
            .Where(item => item.RoomId > 0)
            .Select(item => item.RoomId)
            .ToHashSet();
        var removingIds = existingRooms
            .Where(room => !keptIds.Contains(room.Id))
            .Select(room => room.Id)
            .ToList();
        await PrepareRoomsForDeletionAsync(removingIds, cancellationToken);

        var rooms = SyncRoomsForType(dto.RoomTypeId, existingRooms, dto.RoomNumbers);

        // Uniqueness against rooms outside this sync set (allows swaps within the type)
        var updatingIds = rooms.Where(r => r.Id > 0).Select(r => r.Id).ToHashSet();
        foreach (var room in rooms)
        {
            var takenElsewhere = await _db.Rooms.AsNoTracking()
                .AnyAsync(
                    r => r.RoomNumber == room.RoomNumber && !updatingIds.Contains(r.Id),
                    cancellationToken);
            if (takenElsewhere)
            {
                throw new InvalidOperationException($"Room number '{room.RoomNumber}' already exists.");
            }
        }

        foreach (var room in rooms)
        {
            room.Status = RoomStatus.Available;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return rooms.Count;
    }

    private List<Room> SyncRoomsForType(
        int roomTypeId,
        List<Room> existingRooms,
        List<RoomNumberUpdateItem> updates)
    {
        if (updates.Count == 0)
        {
            throw new InvalidOperationException("At least one room is required.");
        }

        var existingById = existingRooms.ToDictionary(r => r.Id);
        var keptIds = new HashSet<int>();
        var result = new List<Room>();

        foreach (var update in updates)
        {
            var number = update.RoomNumber.Trim();
            if (string.IsNullOrWhiteSpace(number))
            {
                throw new InvalidOperationException("Each room must have a room number.");
            }

            if (update.RoomId > 0)
            {
                if (!existingById.TryGetValue(update.RoomId, out var room))
                {
                    throw new InvalidOperationException(
                        "One or more rooms do not belong to this room type.");
                }

                room.RoomNumber = number;
                keptIds.Add(room.Id);
                result.Add(room);
            }
            else
            {
                var room = new Room
                {
                    RoomTypeId = roomTypeId,
                    RoomNumber = number,
                    Status = RoomStatus.Available
                };
                _db.Rooms.Add(room);
                result.Add(room);
            }
        }

        var toRemove = existingRooms.Where(r => !keptIds.Contains(r.Id)).ToList();
        if (toRemove.Count > 0)
        {
            _db.Rooms.RemoveRange(toRemove);
        }

        return result;
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken cancellationToken = default)
    {
        var room = await GetByIdWithDetailsAsync(id, cancellationToken);
        if (room is null)
        {
            return false;
        }

        await PrepareRoomsForDeletionAsync([room.Id], cancellationToken);

        var roomTypeId = room.RoomTypeId;
        var remainingOthers = await _db.Rooms.CountAsync(
            r => r.RoomTypeId == roomTypeId && r.Id != id,
            cancellationToken);

        _db.Rooms.Remove(room);

        if (remainingOthers == 0)
        {
            await PrepareRoomTypeForDeletionAsync(roomTypeId, cancellationToken);
            var roomType = await _db.RoomTypes.FirstOrDefaultAsync(
                t => t.RoomTypeId == roomTypeId,
                cancellationToken);
            if (roomType is not null)
            {
                _db.RoomTypes.Remove(roomType);
            }
        }

        await _db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<RoomDto?> SetGuestReadyAsync(
        int id,
        bool open,
        CancellationToken cancellationToken = default)
    {
        var room = await _db.Rooms
            .Include(r => r.RoomType)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (room is null)
        {
            return null;
        }

        if (room.Status == RoomStatus.Occupied)
        {
            throw new InvalidOperationException(
                $"Room {room.RoomNumber} is Occupied. Check out the guest before changing availability.");
        }

        if (open)
        {
            if (room.Status == RoomStatus.Available)
            {
                return room.ToDto();
            }

            room.Status = RoomStatus.Available;
        }
        else
        {
            if (room.Status == RoomStatus.Cleaning)
            {
                return room.ToDto();
            }

            // Available or Unavailable → maintaining/cleaning (cannot take guests).
            room.Status = RoomStatus.Cleaning;
        }

        await _db.SaveChangesAsync(cancellationToken);
        return room.ToDto();
    }

    public async Task<int> DeleteRoomTypeAsync(
        int roomTypeId,
        CancellationToken cancellationToken = default)
    {
        var roomType = await _db.RoomTypes
            .Include(t => t.Rooms)
            .FirstOrDefaultAsync(t => t.RoomTypeId == roomTypeId, cancellationToken);
        if (roomType is null)
        {
            return 0;
        }

        var rooms = roomType.Rooms.ToList();
        await PrepareRoomsForDeletionAsync(rooms.Select(r => r.Id).ToList(), cancellationToken);
        await PrepareRoomTypeForDeletionAsync(roomTypeId, cancellationToken);

        _db.Rooms.RemoveRange(rooms);
        _db.RoomTypes.Remove(roomType);
        await _db.SaveChangesAsync(cancellationToken);
        return rooms.Count;
    }

    /// <summary>
    /// Blocks delete when a room is occupied or on a confirmed booking.
    /// Removes leftover AssignedRoom rows from finished/cancelled bookings so the FK does not block.
    /// </summary>
    private async Task PrepareRoomsForDeletionAsync(
        IReadOnlyCollection<int> roomIds,
        CancellationToken cancellationToken)
    {
        if (roomIds.Count == 0)
        {
            return;
        }

        var occupiedNumbers = await _db.Rooms
            .AsNoTracking()
            .Where(r => roomIds.Contains(r.Id) && r.Status == RoomStatus.Occupied)
            .Select(r => r.RoomNumber)
            .OrderBy(n => n)
            .ToListAsync(cancellationToken);

        if (occupiedNumbers.Count > 0)
        {
            throw new InvalidOperationException(
                $"Cannot delete room(s) {string.Join(", ", occupiedNumbers)} while occupied. Check the guest out first.");
        }

        var blockingNumbers = await _db.AssignedRooms
            .AsNoTracking()
            .Where(a => roomIds.Contains(a.RoomId)
                        && !a.BookingItem.Booking.IsArchived
                        && a.BookingItem.Booking.Status == BookingStatus.Confirmed)
            .Select(a => a.Room.RoomNumber)
            .Distinct()
            .OrderBy(n => n)
            .ToListAsync(cancellationToken);

        if (blockingNumbers.Count > 0)
        {
            throw new InvalidOperationException(
                $"Cannot delete room(s) {string.Join(", ", blockingNumbers)} while assigned to a confirmed booking. Cancel or check out that stay first.");
        }

        var leftoverAssignments = await _db.AssignedRooms
            .Where(a => roomIds.Contains(a.RoomId))
            .ToListAsync(cancellationToken);

        if (leftoverAssignments.Count > 0)
        {
            _db.AssignedRooms.RemoveRange(leftoverAssignments);
        }
    }

    /// <summary>
    /// Blocks delete when pending/confirmed bookings still use the type.
    /// Finished booking lines keep RoomTypeName; FK is cleared via SetNull on delete.
    /// </summary>
    private async Task PrepareRoomTypeForDeletionAsync(
        int roomTypeId,
        CancellationToken cancellationToken)
    {
        var activeStatuses = new[] { BookingStatus.Pending, BookingStatus.Confirmed };
        var activeCount = await _db.BookingItems
            .AsNoTracking()
            .CountAsync(
                line => line.RoomTypeId == roomTypeId
                        && !line.Booking.IsArchived
                        && activeStatuses.Contains(line.Booking.Status),
                cancellationToken);

        if (activeCount > 0)
        {
            throw new InvalidOperationException(
                "Cannot delete this room type while pending or confirmed bookings still use it. Cancel or check those stays out first.");
        }
    }

    private async Task<Room?> GetByIdWithDetailsAsync(int id, CancellationToken cancellationToken)
    {
        return await _db.Rooms
            .Include(r => r.RoomType)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
    }

    private async Task<bool> RoomNumberExistsAsync(
        string roomNumber,
        int? excludeRoomId = null,
        CancellationToken cancellationToken = default)
    {
        var query = _db.Rooms.AsNoTracking().Where(r => r.RoomNumber == roomNumber);
        if (excludeRoomId.HasValue)
        {
            query = query.Where(r => r.Id != excludeRoomId.Value);
        }

        return await query.AnyAsync(cancellationToken);
    }

    private async Task<bool> TypeNameExistsAsync(
        string typeName,
        int? excludeRoomTypeId = null,
        CancellationToken cancellationToken = default)
    {
        var normalized = typeName.Trim();
        var query = _db.RoomTypes.AsNoTracking()
            .Where(t => t.Name.ToLower() == normalized.ToLower());

        if (excludeRoomTypeId.HasValue)
        {
            query = query.Where(t => t.RoomTypeId != excludeRoomTypeId.Value);
        }

        return await query.AnyAsync(cancellationToken);
    }

    private async Task<RoomType> GetOrCreateRoomTypeAsync(
        string typeName,
        string? description,
        IEnumerable<string> inclusions,
        IEnumerable<string> images,
        CancellationToken cancellationToken)
    {
        var normalized = typeName.Trim();
        var normalizedInclusions = RoomMappings.NormalizeInclusions(inclusions);
        var existing = await _db.RoomTypes
            .FirstOrDefaultAsync(t => t.Name.ToLower() == normalized.ToLower(), cancellationToken);
        if (existing is not null)
        {
            existing.Description = description?.Trim();
            existing.Inclusions = normalizedInclusions;
            _db.Entry(existing).Property(t => t.Inclusions).IsModified = true;
            await _db.SaveChangesAsync(cancellationToken);
            return existing;
        }

        var roomType = new RoomType
        {
            Name = normalized,
            Description = description?.Trim(),
            CreatedAt = DateTime.UtcNow,
            Inclusions = normalizedInclusions,
            Images = RoomMappings.NormalizeImages(images)
        };

        _db.RoomTypes.Add(roomType);
        await _db.SaveChangesAsync(cancellationToken);
        return roomType;
    }
}
