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
            dto.TypeName,
            dto.Description,
            dto.Inclusions,
            Array.Empty<string>(),
            cancellationToken);

        var room = new Room
        {
            RoomTypeId = roomType.RoomTypeId,
            RoomNumber = dto.RoomNumber.Trim(),
            PricePerNight = dto.PricePerNight,
            MaxOccupancy = dto.MaxOccupancy,
            BedCount = dto.BedCount,
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

        var typeName = dto.TypeName.Trim();
        if (await TypeNameExistsAsync(typeName, cancellationToken: cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{typeName}' already exists.");
        }

        var roomType = new RoomType
        {
            TypeName = typeName,
            Description = dto.Description?.Trim(),
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
                PricePerNight = dto.PricePerNight,
                MaxOccupancy = dto.MaxOccupancy,
                BedCount = dto.BedCount,
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

        if (await TypeNameExistsAsync(dto.TypeName, roomType.RoomTypeId, cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{dto.TypeName.Trim()}' already exists.");
        }

        roomType.TypeName = dto.TypeName.Trim();
        roomType.Description = dto.Description?.Trim();
        roomType.Inclusions = RoomMappings.NormalizeInclusions(dto.Inclusions);
        _db.Entry(roomType).Property(t => t.Inclusions).IsModified = true;

        room.RoomNumber = dto.RoomNumber.Trim();
        room.PricePerNight = dto.PricePerNight;
        room.MaxOccupancy = dto.MaxOccupancy;
        room.BedCount = dto.BedCount;
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

        if (await TypeNameExistsAsync(dto.TypeName, dto.RoomTypeId, cancellationToken))
        {
            throw new InvalidOperationException($"Room type '{dto.TypeName.Trim()}' already exists.");
        }

        roomType.TypeName = dto.TypeName.Trim();
        roomType.Description = dto.Description?.Trim();
        roomType.Inclusions = RoomMappings.NormalizeInclusions(dto.Inclusions);
        roomType.Images = RoomMappings.NormalizeImages(dto.Images);
        _db.Entry(roomType).Property(t => t.Inclusions).IsModified = true;
        _db.Entry(roomType).Property(t => t.Images).IsModified = true;

        var existingRooms = await _db.Rooms
            .Include(r => r.RoomType)
            .Where(r => r.RoomTypeId == dto.RoomTypeId)
            .OrderBy(r => r.RoomNumber)
            .ToListAsync(cancellationToken);

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
            room.PricePerNight = dto.PricePerNight;
            room.MaxOccupancy = dto.MaxOccupancy;
            room.BedCount = dto.BedCount;
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

        var roomTypeId = room.RoomTypeId;
        _db.Rooms.Remove(room);
        await _db.SaveChangesAsync(cancellationToken);

        var remaining = await _db.Rooms.CountAsync(r => r.RoomTypeId == roomTypeId, cancellationToken);
        if (remaining == 0)
        {
            var roomType = await _db.RoomTypes.FirstOrDefaultAsync(t => t.RoomTypeId == roomTypeId, cancellationToken);
            if (roomType is not null)
            {
                _db.RoomTypes.Remove(roomType);
                await _db.SaveChangesAsync(cancellationToken);
            }
        }

        return true;
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
        _db.Rooms.RemoveRange(rooms);
        _db.RoomTypes.Remove(roomType);
        await _db.SaveChangesAsync(cancellationToken);
        return rooms.Count;
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
            .Where(t => t.TypeName.ToLower() == normalized.ToLower());

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
            .FirstOrDefaultAsync(t => t.TypeName.ToLower() == normalized.ToLower(), cancellationToken);
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
            TypeName = normalized,
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
