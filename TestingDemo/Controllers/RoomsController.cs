using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TestingDemo.Hubs;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.ViewModels;

namespace TestingDemo.Controllers;

public class RoomsController : Controller
{
    private readonly IRoomService _roomService;
    private readonly IBookingService _bookingService;
    private readonly IHubContext<BookingNotificationsHub, IBookingNotificationsClient> _hub;
    private readonly IWebHostEnvironment _environment;

    public RoomsController(
        IRoomService roomService,
        IBookingService bookingService,
        IHubContext<BookingNotificationsHub, IBookingNotificationsClient> hub,
        IWebHostEnvironment environment)
    {
        _roomService = roomService;
        _bookingService = bookingService;
        _hub = hub;
        _environment = environment;
    }

    public IActionResult Index()
    {
        return View();
    }

    public IActionResult List()
    {
        return RedirectToAction(nameof(Index), new { view = "list" });
    }

    public async Task<IActionResult> EditType(int id, CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var roomsOfType = rooms
            .Where(r => r.RoomTypeId == id)
            .OrderBy(r => r.RoomNumber, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (roomsOfType.Count == 0)
        {
            return NotFound();
        }

        var model = RoomTypeFormViewModel.FromRooms(roomsOfType);
        await PopulateLookupsAsync(model, cancellationToken);
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(60_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 60_000_000)]
    public async Task<IActionResult> EditType(
        RoomTypeFormViewModel model,
        CancellationToken cancellationToken)
    {
        model.SelectedInclusions ??= new List<string>();
        model.ExistingImages ??= new List<string>();
        model.Rooms ??= new List<RoomNumberEditItem>();
        model.EnsureRooms();
        var uploadedFiles = CollectUploadedImages(model.UploadedImages);

        ValidateEditTypeRoomNumbers(model);

        // Persist new uploads immediately so they are not lost when the form is redisplayed.
        if (!await TryStageUploadedImagesAsync(
                uploadedFiles,
                model.Name,
                paths => model.ExistingImages = paths,
                model.ExistingImages,
                nameof(model.UploadedImages),
                cancellationToken))
        {
            await PopulateLookupsAsync(model, cancellationToken);
            return View(model);
        }

        if (!ModelState.IsValid)
        {
            await PopulateLookupsAsync(model, cancellationToken);
            return View(model);
        }

        try
        {
            var previousImages = (await _roomService.GetAllAsync(cancellationToken))
                .Where(r => r.RoomTypeId == model.RoomTypeId)
                .SelectMany(r => r.Images)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var finalImages = model.ExistingImages
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (finalImages.Count > RoomImageStorage.MaxImages)
            {
                throw new InvalidOperationException(
                    $"A room type can have at most {RoomImageStorage.MaxImages} images.");
            }

            var updatedCount = await _roomService.UpdateRoomTypeAsync(
                model.ToDto(finalImages),
                cancellationToken);

            if (updatedCount == 0)
            {
                return NotFound();
            }

            var removed = previousImages
                .Where(path => !finalImages.Contains(path, StringComparer.OrdinalIgnoreCase))
                .ToList();
            RoomImageStorage.DeleteFiles(_environment, removed);

            TempData["Success"] =
                $"Room type updated successfully for {updatedCount} room(s).";
            return RedirectToAction(nameof(Index));
        }
        catch (Exception ex) when (ex is InvalidOperationException or FluentValidation.ValidationException)
        {
            ModelState.AddModelError(string.Empty, ex.Message);
            await PopulateLookupsAsync(model, cancellationToken);
            return View(model);
        }
    }

    public async Task<IActionResult> DeleteType(int id, CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var roomType = RoomIndexViewModel.FromRooms(rooms).RoomTypes
            .FirstOrDefault(t => t.RoomTypeId == id);

        if (roomType is null)
        {
            return NotFound();
        }

        return View(roomType);
    }

    [HttpPost, ActionName("DeleteType")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteTypeConfirmed(
        int id,
        CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var images = rooms
            .Where(r => r.RoomTypeId == id)
            .SelectMany(r => r.Images)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var typeName = rooms.FirstOrDefault(r => r.RoomTypeId == id)?.Name ?? "Room type";
        var deletedCount = await _roomService.DeleteRoomTypeAsync(id, cancellationToken);
        if (deletedCount == 0)
        {
            return NotFound();
        }

        RoomImageStorage.DeleteFiles(_environment, images);

        TempData["Success"] =
            $"Room type '{typeName}' and {deletedCount} room(s) were deleted successfully.";
        return RedirectToAction(nameof(Index));
    }

    public async Task<IActionResult> Details(int id, CancellationToken cancellationToken)
    {
        var room = await _roomService.GetByIdAsync(id, cancellationToken);
        if (room is null)
        {
            return NotFound();
        }

        var currentStay = room.Status == RoomStatus.Occupied
            ? await _bookingService.GetActiveStayByRoomIdAsync(id, cancellationToken)
            : null;

        return View(new RoomDetailsViewModel
        {
            Room = room,
            CurrentStay = currentStay
        });
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Checkout(
        int id,
        string rowVersion,
        CancellationToken cancellationToken)
    {
        var stay = await _bookingService.GetActiveStayByRoomIdAsync(id, cancellationToken);
        if (stay is null)
        {
            TempData["Error"] = "No confirmed guest stay is assigned to this room.";
            return RedirectToAction(nameof(Details), new { id });
        }

        try
        {
            var booking = await _bookingService.CheckoutAsync(
                stay.Id,
                rowVersion,
                cancellationToken);
            await _hub.Clients.All.BookingArchived(booking.Id);
            TempData["Success"] =
                $"Checked out {booking.Reference}. Room is available again.";
            return RedirectToAction(nameof(Index), new { view = "list" });
        }
        catch (BookingConcurrencyException ex)
        {
            TempData["Error"] = ex.Message;
            return RedirectToAction(nameof(Details), new { id });
        }
    }

    public async Task<IActionResult> Create(CancellationToken cancellationToken)
    {
        var model = new CreateRoomsViewModel();
        await PopulateCreateLookupsAsync(model, cancellationToken);
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    [RequestSizeLimit(60_000_000)]
    [RequestFormLimits(MultipartBodyLengthLimit = 60_000_000)]
    public async Task<IActionResult> Create(CreateRoomsViewModel model, CancellationToken cancellationToken)
    {
        model.SelectedInclusions ??= new List<string>();
        model.ImagePaths ??= new List<string>();
        // Prefer raw form files — more reliable than model-bound IFormFile[] after JS DataTransfer.
        var uploadedFiles = CollectUploadedImages(model.UploadedImages);
        model.EnsureAssignedRoomNumbers();

        if (model.AssignedRoomNumbers.Count != model.RoomCount)
        {
            ModelState.AddModelError(nameof(model.AssignedRoomNumbers),
                $"Please assign a room number for all {model.RoomCount} room(s).");
        }

        if (model.AssignedRoomNumbers.Any(string.IsNullOrWhiteSpace))
        {
            ModelState.AddModelError(nameof(model.AssignedRoomNumbers),
                "Each room must have a room number selected.");
        }

        if (model.AssignedRoomNumbers.Distinct(StringComparer.OrdinalIgnoreCase).Count() != model.AssignedRoomNumbers.Count)
        {
            ModelState.AddModelError(nameof(model.AssignedRoomNumbers),
                "Each room number must be unique.");
        }

        // File inputs cannot be restored after a round-trip. Persist any new uploads now so
        // they survive validation errors and show under "Current uploaded images".
        if (!await TryStageUploadedImagesAsync(
                uploadedFiles,
                model.Name,
                paths => model.ImagePaths = paths,
                model.ImagePaths,
                nameof(model.UploadedImages),
                cancellationToken))
        {
            await PopulateCreateLookupsAsync(model, cancellationToken);
            return View(model);
        }

        if (!ModelState.IsValid)
        {
            await PopulateCreateLookupsAsync(model, cancellationToken);
            return View(model);
        }

        try
        {
            if (model.ImagePaths.Count > RoomImageStorage.MaxImages)
            {
                throw new InvalidOperationException(
                    $"A room type can have at most {RoomImageStorage.MaxImages} images.");
            }

            var createdCount = await _roomService.CreateBulkAsync(model.ToCreateDto(), cancellationToken);
            TempData["Success"] = createdCount == 1
                ? "Room created successfully."
                : $"{createdCount} rooms created successfully.";
            return RedirectToAction(nameof(Index), new { view = "list" });
        }
        catch (Exception ex)
        {
            // Keep the site running; show the error on the form instead of killing the process/debugger.
            ModelState.AddModelError(
                string.Empty,
                string.IsNullOrWhiteSpace(ex.Message)
                    ? "Could not create the room type."
                    : ex.Message);
            await PopulateCreateLookupsAsync(model, cancellationToken);
            return View(model);
        }
    }

    public async Task<IActionResult> Edit(int id, CancellationToken cancellationToken)
    {
        var room = await _roomService.GetByIdAsync(id, cancellationToken);
        if (room is null)
        {
            return NotFound();
        }

        var model = RoomFormViewModel.FromDto(room);
        await PopulateLookupsAsync(model, cancellationToken);
        return View(model);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(int id, RoomFormViewModel model, CancellationToken cancellationToken)
    {
        if (id != model.Id)
        {
            return BadRequest();
        }

        model.SelectedInclusions ??= new List<string>();

        if (!ModelState.IsValid)
        {
            await PopulateLookupsAsync(model, cancellationToken);
            return View(model);
        }

        try
        {
            var updated = await _roomService.UpdateAsync(model.ToUpdateDto(), cancellationToken);
            if (updated is null)
            {
                return NotFound();
            }

            TempData["Success"] = "Room updated successfully.";
            return RedirectToAction(nameof(List));
        }
        catch (Exception ex) when (ex is InvalidOperationException or FluentValidation.ValidationException)
        {
            ModelState.AddModelError(string.Empty, ex.Message);
            await PopulateLookupsAsync(model, cancellationToken);
            return View(model);
        }
    }

    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken)
    {
        var room = await _roomService.GetByIdAsync(id, cancellationToken);
        if (room is null)
        {
            return NotFound();
        }

        return View(room);
    }

    [HttpPost, ActionName("Delete")]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> DeleteConfirmed(int id, CancellationToken cancellationToken)
    {
        var deleted = await _roomService.DeleteAsync(id, cancellationToken);
        if (!deleted)
        {
            return NotFound();
        }

        TempData["Success"] = "Room deleted successfully.";
        return RedirectToAction(nameof(List));
    }

    private List<IFormFile> CollectUploadedImages(IEnumerable<IFormFile>? boundFiles)
    {
        var fromForm = Request.HasFormContentType
            ? Request.Form.Files
                .Where(f => f.Length > 0 &&
                            (f.Name.Equals(nameof(CreateRoomsViewModel.UploadedImages), StringComparison.OrdinalIgnoreCase) ||
                             f.Name.StartsWith(nameof(CreateRoomsViewModel.UploadedImages) + "[", StringComparison.OrdinalIgnoreCase)))
                .ToList()
            : new List<IFormFile>();

        if (fromForm.Count > 0)
        {
            return fromForm;
        }

        return (boundFiles ?? Enumerable.Empty<IFormFile>())
            .Where(f => f is { Length: > 0 })
            .ToList();
    }

    /// <summary>
    /// Saves newly posted files to disk and merges them into the preserved image path list.
    /// Browsers cannot restore file inputs after a failed post, so staging is required.
    /// </summary>
    private async Task<bool> TryStageUploadedImagesAsync(
        IReadOnlyList<IFormFile> uploadedFiles,
        string roomTypeName,
        Action<List<string>> assignPaths,
        IEnumerable<string> existingPaths,
        string errorKey,
        CancellationToken cancellationToken)
    {
        var preserved = (existingPaths ?? Enumerable.Empty<string>())
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => p.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (uploadedFiles.Count == 0)
        {
            assignPaths(preserved);
            return true;
        }

        try
        {
            var uploaded = await RoomImageStorage.SaveAsync(
                _environment,
                uploadedFiles,
                roomTypeName,
                cancellationToken);

            var merged = preserved
                .Concat(uploaded)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (merged.Count > RoomImageStorage.MaxImages)
            {
                RoomImageStorage.DeleteFiles(_environment, uploaded);
                ModelState.AddModelError(
                    errorKey,
                    $"A room type can have at most {RoomImageStorage.MaxImages} images.");
                assignPaths(preserved);
                return false;
            }

            assignPaths(merged);
            return true;
        }
        catch (Exception ex)
        {
            ModelState.AddModelError(
                errorKey,
                string.IsNullOrWhiteSpace(ex.Message)
                    ? "Could not upload the selected images."
                    : ex.Message);
            assignPaths(preserved);
            return false;
        }
    }

    private async Task PopulateCreateLookupsAsync(CreateRoomsViewModel model, CancellationToken cancellationToken)
    {
        model.EnsureAssignedRoomNumbers();
        model.AvailableInclusions = await GetAvailableInclusionsAsync(
            model.SelectedInclusions,
            cancellationToken);
    }

    private async Task PopulateLookupsAsync(RoomFormViewModel model, CancellationToken cancellationToken)
    {
        model.AvailableInclusions = await GetAvailableInclusionsAsync(
            model.SelectedInclusions,
            cancellationToken);
    }

    private async Task PopulateLookupsAsync(RoomTypeFormViewModel model, CancellationToken cancellationToken)
    {
        model.EnsureRooms();
        model.AvailableInclusions = await GetAvailableInclusionsAsync(
            model.SelectedInclusions,
            cancellationToken);
    }

    private void ValidateEditTypeRoomNumbers(RoomTypeFormViewModel model)
    {
        if (model.RoomCount != model.Rooms.Count)
        {
            ModelState.AddModelError(
                nameof(model.RoomCount),
                "Room count must match the number of room number fields.");
        }

        if (model.Rooms.Count == 0)
        {
            ModelState.AddModelError(nameof(model.Rooms), "At least one room is required.");
            return;
        }

        if (model.Rooms.Any(r => string.IsNullOrWhiteSpace(r.RoomNumber)))
        {
            ModelState.AddModelError(nameof(model.Rooms), "Each room must have a room number.");
        }

        if (model.Rooms
                .Select(r => r.RoomNumber.Trim())
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count()
            != model.Rooms.Count(r => !string.IsNullOrWhiteSpace(r.RoomNumber)))
        {
            ModelState.AddModelError(nameof(model.Rooms), "Each room number must be unique.");
        }
    }

    private async Task<List<string>> GetAvailableInclusionsAsync(
        IEnumerable<string>? selected,
        CancellationToken cancellationToken)
    {
        var rooms = await _roomService.GetAllAsync(cancellationToken);
        var fromRooms = rooms.SelectMany(r => r.Inclusions);

        return InclusionCatalog.DefaultItems
            .Concat(fromRooms)
            .Concat(selected ?? Enumerable.Empty<string>())
            .Select(i => i.Trim())
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
