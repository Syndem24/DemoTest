using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IStayReviewService
{
    Task<StayReviewPublicPageDto> GetPublicAsync(int take = 12, CancellationToken cancellationToken = default);

    Task<StayReviewPortalPageDto> GetPortalAsync(
        string guestUserId,
        string? email,
        string? googleEmail,
        CancellationToken cancellationToken = default);

    Task<StayReviewMineDto> CreateAsync(
        string guestUserId,
        string? email,
        string? googleEmail,
        string? fullName,
        StayReviewWriteRequest request,
        CancellationToken cancellationToken = default);

    Task<StayReviewMineDto> UpdateAsync(
        int id,
        string guestUserId,
        StayReviewWriteRequest request,
        CancellationToken cancellationToken = default);

    Task<AdminStayReviewPageDto> GetAdminPageAsync(
        int page = 1,
        int pageSize = 20,
        string replyState = "all",
        CancellationToken cancellationToken = default);

    Task<AdminStayReviewDto> GetAdminDetailAsync(
        int id,
        CancellationToken cancellationToken = default);

    Task<AdminStayReviewDto> SetPublishStateAsync(
        int id,
        bool isPublished,
        string actorUserId,
        string actorDisplayName,
        CancellationToken cancellationToken = default);

    Task<AdminStayReviewDto> UpsertHotelReplyAsync(
        int id,
        string? reply,
        string actorUserId,
        string actorDisplayName,
        CancellationToken cancellationToken = default);
}

public sealed class StayReviewService : IStayReviewService
{
    public static readonly IReadOnlyList<string> AllowedTags =
    [
        "FriendlyStaff",
        "CleanRooms",
        "QuietStay",
        "GreatValue",
        "ComfortableBed",
        "NiceBathroom",
        "SlowCheckIn",
        "WifiIssues"
    ];

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static readonly TimeSpan EditWindow = TimeSpan.FromDays(14);

    private readonly HotelBookingDbContext _db;
    private readonly ISystemAuditRecorder _audit;

    public StayReviewService(HotelBookingDbContext db, ISystemAuditRecorder audit)
    {
        _db = db;
        _audit = audit;
    }

    public async Task<StayReviewPublicPageDto> GetPublicAsync(
        int take = 12,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 50);
        var baseQuery = _db.StayReviews.AsNoTracking().Where(r => r.IsPublished);

        var count = await baseQuery.CountAsync(cancellationToken);
        var average = count == 0
            ? 0d
            : await baseQuery.AverageAsync(r => (double)r.OverallRating, cancellationToken);

        var rows = await baseQuery
            .OrderByDescending(r => r.CreatedAtUtc)
            .Take(take)
            .Select(r => new
            {
                r.Id,
                r.DisplayName,
                r.OverallRating,
                r.StaffRating,
                r.ComfortRating,
                r.FacilitiesRating,
                r.WouldRecommend,
                r.Comment,
                r.TagsJson,
                r.CreatedAtUtc,
                Reference = r.Booking.Reference,
                r.HotelReply,
                r.HotelReplyAtUtc
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => new StayReviewPublicDto(
            r.Id,
            MaskPublicDisplayName(r.DisplayName),
            r.OverallRating,
            r.StaffRating,
            r.ComfortRating,
            r.FacilitiesRating,
            r.WouldRecommend,
            r.Comment,
            ParseTags(r.TagsJson),
            r.CreatedAtUtc,
            r.Reference,
            r.HotelReply,
            r.HotelReplyAtUtc)).ToList();

        return new StayReviewPublicPageDto(
            Math.Round(average, 1),
            count,
            items);
    }

    public async Task<StayReviewPortalPageDto> GetPortalAsync(
        string guestUserId,
        string? email,
        string? googleEmail,
        CancellationToken cancellationToken = default)
    {
        var emails = BuildEmailSet(email, googleEmail);
        var reviewedIds = await _db.StayReviews.AsNoTracking()
            .Where(r => r.GuestUserId == guestUserId)
            .Select(r => r.BookingId)
            .ToListAsync(cancellationToken);

        var eligible = new List<StayReviewEligibleStayDto>();
        if (emails.Count > 0)
        {
            var stays = await _db.Bookings.AsNoTracking()
                .Where(b => b.Status == BookingStatus.CheckedOut)
                .OrderByDescending(b => b.CheckoutTimeUtc)
                .Take(80)
                .Select(b => new { b.Id, b.Reference, b.CheckInAtUtc, b.CheckoutTimeUtc, b.GuestName, b.GuestEmail })
                .ToListAsync(cancellationToken);

            eligible = stays
                .Where(b => EmailMatches(b.GuestEmail, emails) && !reviewedIds.Contains(b.Id))
                .Take(20)
                .Select(b => new StayReviewEligibleStayDto(
                    b.Id,
                    b.Reference,
                    b.CheckInAtUtc,
                    b.CheckoutTimeUtc,
                    b.GuestName))
                .ToList();
        }

        var mineRows = await _db.StayReviews.AsNoTracking()
            .Where(r => r.GuestUserId == guestUserId)
            .OrderByDescending(r => r.CreatedAtUtc)
            .Take(40)
            .Select(r => new
            {
                r.Id,
                r.BookingId,
                Reference = r.Booking.Reference,
                Checkout = r.Booking.CheckoutTimeUtc,
                r.OverallRating,
                r.StaffRating,
                r.ComfortRating,
                r.FacilitiesRating,
                r.WouldRecommend,
                r.Comment,
                r.TagsJson,
                r.CreatedAtUtc,
                r.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var mine = mineRows.Select(r => new StayReviewMineDto(
            r.Id,
            r.BookingId,
            r.Reference,
            r.Checkout,
            r.OverallRating,
            r.StaffRating,
            r.ComfortRating,
            r.FacilitiesRating,
            r.WouldRecommend,
            r.Comment,
            ParseTags(r.TagsJson),
            now - r.CreatedAtUtc <= EditWindow,
            r.CreatedAtUtc,
            r.UpdatedAtUtc)).ToList();

        return new StayReviewPortalPageDto(eligible, mine);
    }

    public async Task<StayReviewMineDto> CreateAsync(
        string guestUserId,
        string? email,
        string? googleEmail,
        string? fullName,
        StayReviewWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        ValidateRatings(request);
        var emails = BuildEmailSet(email, googleEmail);
        if (emails.Count == 0)
            throw new InvalidOperationException("Your account needs an email before you can leave a review.");

        return await ExecuteInSerializableTransactionAsync(async ct =>
        {
            var booking = await _db.Bookings.FirstOrDefaultAsync(b => b.Id == request.BookingId, ct)
                ?? throw new KeyNotFoundException("Stay was not found.");

            if (booking.Status != BookingStatus.CheckedOut)
                throw new InvalidOperationException("You can review a stay only after checkout.");

            if (!EmailMatches(booking.GuestEmail, emails))
                throw new UnauthorizedAccessException("This stay is not linked to your guest account email.");

            var exists = await _db.StayReviews.AnyAsync(r => r.BookingId == booking.Id, ct);
            if (exists)
                throw new InvalidOperationException("This stay already has a review.");

            var now = DateTime.UtcNow;
            var review = new StayReview
            {
                BookingId = booking.Id,
                GuestUserId = guestUserId,
                DisplayName = BuildDisplayName(fullName, booking.GuestName),
                OverallRating = request.OverallRating,
                StaffRating = request.StaffRating,
                ComfortRating = request.ComfortRating,
                FacilitiesRating = request.FacilitiesRating,
                WouldRecommend = request.WouldRecommend,
                Comment = TrimOrNull(request.Comment, 2000),
                TagsJson = SerializeTags(request.Tags),
                IsPublished = true,
                CreatedAtUtc = now,
                UpdatedAtUtc = now
            };

            _db.StayReviews.Add(review);
            _audit.Record(
                SystemAuditIntent.AdministrativeAction,
                SystemAuditDomain.Review,
                "StayReview.Created",
                "StayReview",
                booking.Id.ToString(),
                booking.Reference,
                summary: $"Review {request.OverallRating}/5 for {booking.Reference}",
                actorUserId: guestUserId,
                actorDisplayName: review.DisplayName);
            await _db.SaveChangesAsync(ct);

            return ToMineDto(review, booking.Reference, booking.CheckoutTimeUtc, canEdit: true);
        }, cancellationToken);
    }

    public async Task<StayReviewMineDto> UpdateAsync(
        int id,
        string guestUserId,
        StayReviewWriteRequest request,
        CancellationToken cancellationToken = default)
    {
        ValidateRatings(request);

        var review = await _db.StayReviews
            .Include(r => r.Booking)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Review was not found.");

        if (!string.Equals(review.GuestUserId, guestUserId, StringComparison.Ordinal))
            throw new UnauthorizedAccessException("You can only edit your own review.");

        if (DateTime.UtcNow - review.CreatedAtUtc > EditWindow)
            throw new InvalidOperationException("The edit window for this review has closed.");

        review.OverallRating = request.OverallRating;
        review.StaffRating = request.StaffRating;
        review.ComfortRating = request.ComfortRating;
        review.FacilitiesRating = request.FacilitiesRating;
        review.WouldRecommend = request.WouldRecommend;
        review.Comment = TrimOrNull(request.Comment, 2000);
        review.TagsJson = SerializeTags(request.Tags);
        review.UpdatedAtUtc = DateTime.UtcNow;

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Review,
            "StayReview.Updated",
            "StayReview",
            review.Id.ToString(),
            review.Booking.Reference,
            summary: $"Review updated {request.OverallRating}/5 for {review.Booking.Reference}",
            actorUserId: guestUserId,
            actorDisplayName: review.DisplayName);
        await _db.SaveChangesAsync(cancellationToken);

        return ToMineDto(review, review.Booking.Reference, review.Booking.CheckoutTimeUtc, canEdit: true);
    }

    public async Task<AdminStayReviewPageDto> GetAdminPageAsync(
        int page = 1,
        int pageSize = 20,
        string replyState = "all",
        CancellationToken cancellationToken = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 10, 100);

        var query = _db.StayReviews.AsNoTracking();
        replyState = string.IsNullOrWhiteSpace(replyState) ? "all" : replyState.Trim().ToLowerInvariant();

        query = replyState switch
        {
            "replied" => query.Where(r => r.HotelReply != null && r.HotelReply != ""),
            "pending" => query.Where(r => r.HotelReply == null || r.HotelReply == ""),
            _ => query
        };

        var total = await query.CountAsync(cancellationToken);
        var skip = (page - 1) * pageSize;

        var rows = await query
            .OrderByDescending(r => r.CreatedAtUtc)
            .Skip(skip)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                BookingReference = r.Booking.Reference,
                GuestDisplayName = r.DisplayName,
                r.OverallRating,
                r.Comment,
                r.IsPublished,
                r.CreatedAtUtc,
                HasHotelReply = r.HotelReply != null && r.HotelReply != ""
            })
            .ToListAsync(cancellationToken);

        var items = rows.Select(r => new AdminStayReviewListItemDto(
            r.Id,
            r.BookingReference,
            r.GuestDisplayName,
            r.OverallRating,
            r.IsPublished,
            r.CreatedAtUtc,
            SummarizeText(r.Comment),
            r.HasHotelReply)).ToList();

        return new AdminStayReviewPageDto(items, total, page, pageSize);
    }

    public async Task<AdminStayReviewDto> GetAdminDetailAsync(
        int id,
        CancellationToken cancellationToken = default)
    {
        var review = await _db.StayReviews
            .AsNoTracking()
            .Include(r => r.Booking)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Review was not found.");
        return ToAdminDto(review);
    }

    public async Task<AdminStayReviewDto> SetPublishStateAsync(
        int id,
        bool isPublished,
        string actorUserId,
        string actorDisplayName,
        CancellationToken cancellationToken = default)
    {
        var review = await _db.StayReviews
            .Include(r => r.Booking)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Review was not found.");

        review.IsPublished = isPublished;
        review.UpdatedAtUtc = DateTime.UtcNow;

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Review,
            isPublished ? "StayReview.Published" : "StayReview.Hidden",
            "StayReview",
            review.Id.ToString(),
            review.Booking.Reference,
            summary: $"{(isPublished ? "Published" : "Hidden")} review for {review.Booking.Reference}",
            actorUserId: actorUserId,
            actorDisplayName: actorDisplayName);

        await _db.SaveChangesAsync(cancellationToken);
        return ToAdminDto(review);
    }

    public async Task<AdminStayReviewDto> UpsertHotelReplyAsync(
        int id,
        string? reply,
        string actorUserId,
        string actorDisplayName,
        CancellationToken cancellationToken = default)
    {
        var review = await _db.StayReviews
            .Include(r => r.Booking)
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Review was not found.");

        var cleanReply = TrimOrNull(reply, 1000);
        review.HotelReply = cleanReply;
        review.HotelReplyAtUtc = cleanReply is null ? null : DateTime.UtcNow;
        review.HotelReplyBy = cleanReply is null ? null : TrimOrNull(actorDisplayName, 120);
        review.UpdatedAtUtc = DateTime.UtcNow;

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Review,
            cleanReply is null ? "StayReview.ReplyCleared" : "StayReview.Replied",
            "StayReview",
            review.Id.ToString(),
            review.Booking.Reference,
            summary: cleanReply is null
                ? $"Cleared hotel reply for {review.Booking.Reference}"
                : $"Updated hotel reply for {review.Booking.Reference}",
            actorUserId: actorUserId,
            actorDisplayName: actorDisplayName);

        await _db.SaveChangesAsync(cancellationToken);
        return ToAdminDto(review);
    }

    private static StayReviewMineDto ToMineDto(
        StayReview review,
        string reference,
        DateTime checkout,
        bool canEdit) =>
        new(
            review.Id,
            review.BookingId,
            reference,
            checkout,
            review.OverallRating,
            review.StaffRating,
            review.ComfortRating,
            review.FacilitiesRating,
            review.WouldRecommend,
            review.Comment,
            ParseTags(review.TagsJson),
            canEdit,
            review.CreatedAtUtc,
            review.UpdatedAtUtc);

    private static AdminStayReviewDto ToAdminDto(StayReview review) =>
        new(
            review.Id,
            review.BookingId,
            review.Booking.Reference,
            review.DisplayName,
            review.OverallRating,
            review.StaffRating,
            review.ComfortRating,
            review.FacilitiesRating,
            review.Comment,
            ParseTags(review.TagsJson),
            review.IsPublished,
            review.CreatedAtUtc,
            review.UpdatedAtUtc,
            review.HotelReply,
            review.HotelReplyAtUtc,
            review.HotelReplyBy);

    private static void ValidateRatings(StayReviewWriteRequest request)
    {
        static bool Ok(byte v) => v is >= 1 and <= 5;
        if (!Ok(request.OverallRating) || !Ok(request.StaffRating)
            || !Ok(request.ComfortRating) || !Ok(request.FacilitiesRating))
        {
            throw new InvalidOperationException("Each rating must be between 1 and 5 stars.");
        }
    }

    private static HashSet<string> BuildEmailSet(string? email, string? googleEmail)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        void Add(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return;
            set.Add(value.Trim());
        }
        Add(email);
        Add(googleEmail);
        return set;
    }

    private static bool EmailMatches(string? bookingEmail, HashSet<string> emails)
    {
        if (string.IsNullOrWhiteSpace(bookingEmail) || emails.Count == 0) return false;
        return emails.Contains(bookingEmail.Trim());
    }

    private static string BuildDisplayName(string? fullName, string guestName)
    {
        var source = !string.IsNullOrWhiteSpace(fullName) ? fullName : guestName;
        source = (source ?? "Guest").Trim();
        var first = source.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "Guest";
        if (first.Length > 40) first = first[..40];
        return first;
    }

    private static string MaskPublicDisplayName(string? displayName)
    {
        if (string.IsNullOrWhiteSpace(displayName))
            return "G****";

        var parts = displayName
            .Split([' ', '\t', ',', '.', '-', '_', '/'], StringSplitOptions.RemoveEmptyEntries)
            .Where(part => part.Any(char.IsLetterOrDigit))
            .ToArray();

        if (parts.Length == 0)
            return "G****";

        static string MaskToken(string token)
        {
            var first = token.FirstOrDefault(char.IsLetterOrDigit);
            return first == default ? "G****" : $"{char.ToUpperInvariant(first)}****";
        }

        if (parts.Length == 1)
            return MaskToken(parts[0]);

        return $"{MaskToken(parts[0])} {MaskToken(parts[^1])}";
    }

    private static IReadOnlyList<string> ParseTags(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<string>();
        try
        {
            var list = JsonSerializer.Deserialize<List<string>>(json, JsonOptions) ?? [];
            return list
                .Where(t => AllowedTags.Contains(t, StringComparer.OrdinalIgnoreCase))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(8)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string? SerializeTags(IReadOnlyList<string>? tags)
    {
        if (tags is null || tags.Count == 0) return null;
        var clean = tags
            .Where(t => AllowedTags.Contains(t, StringComparer.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToList();
        return clean.Count == 0 ? null : JsonSerializer.Serialize(clean, JsonOptions);
    }

    private static string? TrimOrNull(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var trimmed = value.Trim();
        return trimmed.Length <= max ? trimmed : trimmed[..max];
    }

    private static string SummarizeText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "No written comment.";
        var oneLine = string.Join(" ", value
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Trim())
            .Where(part => part.Length > 0));
        if (oneLine.Length <= 150) return oneLine;
        return $"{oneLine[..150].TrimEnd()}...";
    }

    private async Task<T> ExecuteInSerializableTransactionAsync<T>(
        Func<CancellationToken, Task<T>> action,
        CancellationToken cancellationToken)
    {
        var strategy = _db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await _db.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);
            var result = await action(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return result;
        });
    }
}
