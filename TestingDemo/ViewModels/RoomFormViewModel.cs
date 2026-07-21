using System.ComponentModel.DataAnnotations;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class RoomFormViewModel
{
    public int Id { get; set; }
    public int RoomTypeId { get; set; }

    [Required]
    [StringLength(100)]
    [Display(Name = "Room Type")]
    public string Name { get; set; } = string.Empty;

    [Required]
    [StringLength(20)]
    [Display(Name = "Room Number")]
    public string RoomNumber { get; set; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; set; }

    [Required]
    [Range(0.01, 999999)]
    [Display(Name = "Price Per Night")]
    [DataType(DataType.Currency)]
    public decimal PricePerNight { get; set; }

    [Required]
    [Range(1, 20)]
    [Display(Name = "Max Occupancy")]
    public int MaxOccupancy { get; set; } = 2;

    [Required]
    [Range(1, 10)]
    [Display(Name = "Bed Count")]
    public int BedCount { get; set; } = 1;

    [Display(Name = "Inclusions")]
    public List<string> SelectedInclusions { get; set; } = new();

    public List<string> AvailableInclusions { get; set; } = new();

    public static RoomFormViewModel FromDto(RoomDto dto)
    {
        return new RoomFormViewModel
        {
            Id = dto.Id,
            RoomTypeId = dto.RoomTypeId,
            Name = dto.Name,
            RoomNumber = dto.RoomNumber,
            Description = dto.Description,
            PricePerNight = dto.PricePerNight,
            MaxOccupancy = dto.MaxOccupancy,
            BedCount = dto.BedCount,
            SelectedInclusions = dto.Inclusions.ToList()
        };
    }

    public UpdateRoomDto ToUpdateDto()
    {
        return new UpdateRoomDto
        {
            Id = Id,
            RoomTypeId = RoomTypeId,
            TypeName = Name,
            RoomNumber = RoomNumber,
            Description = Description,
            PricePerNight = PricePerNight,
            MaxOccupancy = MaxOccupancy,
            BedCount = BedCount,
            Inclusions = SelectedInclusions ?? new List<string>()
        };
    }
}
