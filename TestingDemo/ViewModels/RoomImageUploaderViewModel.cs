namespace TestingDemo.ViewModels;

public class RoomImageUploaderViewModel
{
    public List<string> ExistingImages { get; set; } = new();
    public string InputName { get; set; } = "UploadedImages";
    public string ExistingInputName { get; set; } = "ExistingImages";
}
