namespace TestingDemo.ViewModels;

public class InclusionPickerViewModel
{
    public List<string> SelectedInclusions { get; set; } = new();
    public List<string> AvailableInclusions { get; set; } = new();

    /// <summary>
    /// When true, all catalog defaults are listed as checkboxes (unchecked unless selected).
    /// </summary>
    public bool ShowCatalogChecklist { get; set; } = true;
}
