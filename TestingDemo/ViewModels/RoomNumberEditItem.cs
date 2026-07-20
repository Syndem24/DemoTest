using System.ComponentModel.DataAnnotations;

namespace TestingDemo.ViewModels;

public class RoomNumberEditItem
{
    public int RoomId { get; set; }

    [Required(ErrorMessage = "Room number is required.")]
    [StringLength(20)]
    [Display(Name = "Room Number")]
    public string RoomNumber { get; set; } = string.Empty;
}
