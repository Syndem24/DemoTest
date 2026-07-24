using System.ComponentModel.DataAnnotations;
using TestingDemo.Models;

namespace TestingDemo.ViewModels;

public class CreateRoomsViewModel
{
    [Required]
    [StringLength(100)]
    [Display(Name = "Room Type")]
    public string Name { get; set; } = string.Empty;

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

    [Required]
    [Range(1, 50)]
    [Display(Name = "How Many Rooms")]
    public int RoomCount { get; set; } = 1;

    [Display(Name = "Assigned Room Numbers")]
    public List<string> AssignedRoomNumbers { get; set; } = new() { string.Empty };

    [Display(Name = "Inclusions")]
    public List<string> SelectedInclusions { get; set; } = new();

    public List<string> AvailableInclusions { get; set; } = new();

    /// <summary>
    /// JSON payload of user-defined inclusion categories from the inclusion picker.
    /// </summary>
    public string? CustomCategoriesJson { get; set; }

    public List<CustomInclusionCategory> CustomCategories { get; set; } = new();

    [Display(Name = "Room Type Images")]
    public IFormFile[]? UploadedImages { get; set; }

    public List<string> ImagePaths { get; set; } = new();

    public void EnsureAssignedRoomNumbers()
    {
        AssignedRoomNumbers ??= new List<string>();

        while (AssignedRoomNumbers.Count < RoomCount)
        {
            AssignedRoomNumbers.Add(string.Empty);
        }

        if (AssignedRoomNumbers.Count > RoomCount)
        {
            AssignedRoomNumbers = AssignedRoomNumbers.Take(RoomCount).ToList();
        }
    }

    public CreateRoomsDto ToCreateDto()
    {
        return new CreateRoomsDto
        {
            TypeName = Name,
            Description = Description,
            PricePerNight = PricePerNight,
            MaxOccupancy = MaxOccupancy,
            BedCount = BedCount,
            Inclusions = SelectedInclusions ?? new List<string>(),
            CustomCategories = CustomCategoryFormHelper.Parse(CustomCategoriesJson),
            Images = ImagePaths ?? new List<string>(),
            RoomNumbers = AssignedRoomNumbers
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(n => n.Trim())
                .ToList()
        };
    }
}
