namespace TestingDemo.Services;

public static class RoomImageStorage
{
    public const int MaxImages = 10;
    public const long MaxFileBytes = 5 * 1024 * 1024;
    public static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp"
    };

    public static readonly string[] AllowedContentTypes =
    [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    public static string GetFileName(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        var fileName = Path.GetFileName(path);
        var underscore = fileName.IndexOf('_');
        return underscore > 0 && underscore < fileName.Length - 1
            ? fileName[(underscore + 1)..]
            : fileName;
    }

    public static async Task<List<string>> SaveAsync(
        IWebHostEnvironment environment,
        IEnumerable<IFormFile>? files,
        string roomTypeName,
        CancellationToken cancellationToken = default)
    {
        var saved = new List<string>();
        if (files is null)
        {
            return saved;
        }

        var uploadRoot = Path.Combine(environment.WebRootPath, "uploads", "room-types");
        Directory.CreateDirectory(uploadRoot);

        var safeFolder = string.Concat(
            roomTypeName
                .Trim()
                .ToLowerInvariant()
                .Select(ch => char.IsLetterOrDigit(ch) ? ch : '-'))
            .Trim('-');

        if (string.IsNullOrWhiteSpace(safeFolder))
        {
            safeFolder = "room-type";
        }

        var typeFolder = Path.Combine(uploadRoot, safeFolder);
        Directory.CreateDirectory(typeFolder);

        foreach (var file in files.Where(f => f.Length > 0))
        {
            Validate(file);

            var extension = Path.GetExtension(file.FileName);
            var originalName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeOriginal = string.Concat(
                originalName.Select(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_' ? ch : '-'))
                .Trim('-');

            if (string.IsNullOrWhiteSpace(safeOriginal))
            {
                safeOriginal = "image";
            }

            var storedName = $"{Guid.NewGuid():N}_{safeOriginal}{extension.ToLowerInvariant()}";
            var physicalPath = Path.Combine(typeFolder, storedName);

            await using var stream = new FileStream(physicalPath, FileMode.Create);
            await file.CopyToAsync(stream, cancellationToken);

            saved.Add($"/uploads/room-types/{safeFolder}/{storedName}");
        }

        return saved;
    }

    public static void Validate(IFormFile file)
    {
        var extension = Path.GetExtension(file.FileName);
        if (!AllowedExtensions.Contains(extension))
        {
            throw new InvalidOperationException(
                $"File '{file.FileName}' is not allowed. Upload JPG, JPEG, PNG, or WEBP only.");
        }

        // Some browsers send empty or generic content types; trust the extension when needed.
        var contentType = file.ContentType?.Trim() ?? string.Empty;
        if (!string.IsNullOrEmpty(contentType) &&
            !string.Equals(contentType, "application/octet-stream", StringComparison.OrdinalIgnoreCase) &&
            !AllowedContentTypes.Contains(contentType, StringComparer.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"File '{file.FileName}' has an unsupported content type.");
        }

        if (file.Length > MaxFileBytes)
        {
            throw new InvalidOperationException(
                $"File '{file.FileName}' exceeds the 5 MB size limit.");
        }
    }

    public static void DeleteFiles(IWebHostEnvironment environment, IEnumerable<string> relativePaths)
    {
        foreach (var relativePath in relativePaths)
        {
            if (string.IsNullOrWhiteSpace(relativePath) ||
                !relativePath.StartsWith("/uploads/room-types/", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var physicalPath = Path.Combine(
                environment.WebRootPath,
                relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

            if (File.Exists(physicalPath))
            {
                File.Delete(physicalPath);
            }
        }
    }
}
