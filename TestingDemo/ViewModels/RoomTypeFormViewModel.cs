using System.ComponentModel.DataAnnotations;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class RoomTypeFormViewModel
{
    public int RoomTypeId { get; set; }

    [Required]
    [StringLength(100)]
    [Display(Name = "Room Type")]
    public string Name { get; set; } = string.Empty;

    [StringLength(5000)]
    [Display(Name = "Description")]
    [DataType(DataType.MultilineText)]
    public string? Description { get; set; }

    [Required]
    [Range(0.01, 999999)]
    [Display(Name = "Price Per Night")]
    [DataType(DataType.Currency)]
    public decimal PricePerNight { get; set; }

    [Required]
    [Range(1, 20)]
    [Display(Name = "Max Occupancy")]
    public int MaxOccupancy { get; set; }

    [Required]
    [Range(1, 10)]
    [Display(Name = "Bed Count")]
    public int BedCount { get; set; }

    public List<string> SelectedInclusions { get; set; } = new();
    public List<string> AvailableInclusions { get; set; } = new();

    /// <summary>
    /// JSON payload of user-defined inclusion categories from the inclusion picker.
    /// </summary>
    public string? CustomCategoriesJson { get; set; }

    public List<CustomInclusionCategory> CustomCategories { get; set; } = new();

    [Display(Name = "Room Type Images")]
    public IFormFile[]? UploadedImages { get; set; }

    public List<string> ExistingImages { get; set; } = new();

    [Required]
    [Range(1, 50)]
    [Display(Name = "How Many Rooms")]
    public int RoomCount { get; set; } = 1;

    [Display(Name = "Room Numbers")]
    public List<RoomNumberEditItem> Rooms { get; set; } = new();

    public void EnsureRooms()
    {
        Rooms ??= new List<RoomNumberEditItem>();

        if (RoomCount < 1)
        {
            RoomCount = 1;
        }

        if (RoomCount > 50)
        {
            RoomCount = 50;
        }

        while (Rooms.Count < RoomCount)
        {
            Rooms.Add(new RoomNumberEditItem());
        }

        if (Rooms.Count > RoomCount)
        {
            Rooms = Rooms.Take(RoomCount).ToList();
        }
    }

    public static RoomTypeFormViewModel FromRooms(IReadOnlyList<RoomDto> roomsOfType)
    {
        if (roomsOfType.Count == 0)
        {
            throw new ArgumentException("At least one room is required.", nameof(roomsOfType));
        }

        var sample = roomsOfType[0];
        var rooms = roomsOfType
            .OrderBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase)
            .Select(r => new RoomNumberEditItem
            {
                RoomId = r.Id,
                RoomNumber = r.RoomNumber
            })
            .ToList();

        return new RoomTypeFormViewModel
        {
            RoomTypeId = sample.RoomTypeId,
            Name = sample.Name,
            Description = sample.Description,
            PricePerNight = sample.PricePerNight,
            MaxOccupancy = sample.MaxOccupancy,
            BedCount = sample.BedCount,
            SelectedInclusions = sample.Inclusions.ToList(),
            CustomCategories = sample.CustomCategories.ToList(),
            ExistingImages = sample.Images.ToList(),
            RoomCount = rooms.Count,
            Rooms = rooms
        };
    }

    public UpdateRoomTypeDto ToDto(IEnumerable<string> images)
    {
        EnsureRooms();

        return new UpdateRoomTypeDto
        {
            RoomTypeId = RoomTypeId,
            TypeName = Name,
            Description = Description,
            PricePerNight = PricePerNight,
            MaxOccupancy = MaxOccupancy,
            BedCount = BedCount,
            Inclusions = SelectedInclusions ?? new List<string>(),
            CustomCategories = CustomCategoryFormHelper.Parse(CustomCategoriesJson),
            Images = images.ToList(),
            RoomNumbers = Rooms
                .Select(r => new RoomNumberUpdateItem
                {
                    RoomId = r.RoomId,
                    RoomNumber = (r.RoomNumber ?? string.Empty).Trim()
                })
                .ToList()
        };
    }
}
