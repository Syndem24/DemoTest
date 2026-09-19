using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;

namespace TestingDemo.Services;

public enum StaffPasswordResetCodeVerifyStatus
{
    Success,
    Invalid,
    Expired,
    TooManyAttempts,
    NotFound
}

public sealed record StaffPasswordResetCodeVerifyResult(
    StaffPasswordResetCodeVerifyStatus Status,
    ApplicationUser? User = null,
    int? RemainingAttempts = null);

public interface IStaffPasswordResetCodeService
{
    Task<bool> IssueAndSendAsync(ApplicationUser user, CancellationToken cancellationToken = default);
    Task<int?> GetRemainingAttemptsAsync(string email, CancellationToken cancellationToken = default);
    Task<StaffPasswordResetCodeVerifyResult> VerifyAsync(
        string email,
        string code,
        CancellationToken cancellationToken = default);
}

public sealed class StaffPasswordResetCodeService : IStaffPasswordResetCodeService
{
    public const int CodeLength = 6;
    public const int ExpiryMinutes = 15;
    public const int MaxFailedAttempts = 3;

    private readonly HotelBookingDbContext _db;
    private readonly IStaffEmailSender _emailSender;
    private readonly ILogger<StaffPasswordResetCodeService> _logger;

    public StaffPasswordResetCodeService(
        HotelBookingDbContext db,
        IStaffEmailSender emailSender,
        ILogger<StaffPasswordResetCodeService> logger)
    {
        _db = db;
        _emailSender = emailSender;
        _logger = logger;
    }

    public async Task<bool> IssueAndSendAsync(ApplicationUser user, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(user.Email))
            return false;

        if (!await _emailSender.IsConfiguredAsync(cancellationToken))
            return false;

        var normalizedEmail = user.Email.Trim().ToUpperInvariant();
        var now = DateTime.UtcNow;

        await InvalidatePendingAsync(user.Id, now, cancellationToken);

        var code = GenerateCode();
        var row = new StaffPasswordResetCode
        {
            UserId = user.Id,
            NormalizedEmail = normalizedEmail,
            CodeHash = HashCode(user.Id, code),
            CreatedAtUtc = now,
            ExpiresAtUtc = now.AddMinutes(ExpiryMinutes),
            FailedAttempts = 0
        };

        _db.StaffPasswordResetCodes.Add(row);
        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            await _emailSender.SendPasswordResetOtpAsync(
                user.Email,
                code,
                ExpiryMinutes,
                cancellationToken);
            _logger.LogInformation("Password reset code issued for user {UserId}.", user.Id);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Password reset code email failed for user {UserId}.", user.Id);
            return false;
        }
    }

    public async Task<int?> GetRemainingAttemptsAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = email.Trim().ToUpperInvariant();
        var user = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
        if (user is null)
            return null;

        var now = DateTime.UtcNow;
        var row = await _db.StaffPasswordResetCodes.AsNoTracking()
            .Where(o => o.UserId == user.Id && o.ConsumedAtUtc == null && o.ExpiresAtUtc >= now)
            .OrderByDescending(o => o.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        return row is null ? null : RemainingAttemptsFor(row);
    }

    public async Task<StaffPasswordResetCodeVerifyResult> VerifyAsync(
        string email,
        string code,
        CancellationToken cancellationToken = default)
    {
        var normalizedEmail = email.Trim().ToUpperInvariant();
        if (!IsValidCodeFormat(code))
        {
            var remaining = await GetRemainingAttemptsAsync(email, cancellationToken);
            return new StaffPasswordResetCodeVerifyResult(
                StaffPasswordResetCodeVerifyStatus.Invalid,
                null,
                remaining);
        }

        var user = await _db.Users.AsNoTracking()
            .FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
        if (user is null)
            return new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.NotFound);

        var now = DateTime.UtcNow;
        var row = await _db.StaffPasswordResetCodes
            .Where(o => o.UserId == user.Id && o.ConsumedAtUtc == null)
            .OrderByDescending(o => o.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (row is null)
            return new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.NotFound);

        if (row.ExpiresAtUtc < now)
            return new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.Expired);

        if (row.FailedAttempts >= MaxFailedAttempts)
            return new StaffPasswordResetCodeVerifyResult(
                StaffPasswordResetCodeVerifyStatus.TooManyAttempts,
                null,
                0);

        if (!VerifyHash(user.Id, code, row.CodeHash))
        {
            row.FailedAttempts += 1;
            if (row.FailedAttempts >= MaxFailedAttempts)
                row.ConsumedAtUtc = now;

            await _db.SaveChangesAsync(cancellationToken);
            var remaining = RemainingAttemptsFor(row);
            return row.FailedAttempts >= MaxFailedAttempts
                ? new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.TooManyAttempts, null, 0)
                : new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.Invalid, null, remaining);
        }

        row.ConsumedAtUtc = now;
        await _db.SaveChangesAsync(cancellationToken);
        return new StaffPasswordResetCodeVerifyResult(StaffPasswordResetCodeVerifyStatus.Success, user);
    }

    private static int RemainingAttemptsFor(StaffPasswordResetCode row) =>
        Math.Max(0, MaxFailedAttempts - row.FailedAttempts);

    private async Task InvalidatePendingAsync(string userId, DateTime now, CancellationToken cancellationToken)
    {
        var pending = await _db.StaffPasswordResetCodes
            .Where(o => o.UserId == userId && o.ConsumedAtUtc == null)
            .ToListAsync(cancellationToken);

        foreach (var row in pending)
            row.ConsumedAtUtc = now;

        if (pending.Count > 0)
            await _db.SaveChangesAsync(cancellationToken);
    }

    private static string GenerateCode()
    {
        var value = RandomNumberGenerator.GetInt32(0, 1_000_000);
        return value.ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    internal static bool IsValidCodeFormat(string? code) =>
        code is { Length: CodeLength } && code.All(char.IsDigit);

    internal static string HashCode(string userId, string code)
    {
        var payload = Encoding.UTF8.GetBytes($"{userId}|{code}|staff-pwd-reset-v1");
        var hash = SHA256.HashData(payload);
        return Convert.ToHexString(hash);
    }

    private static bool VerifyHash(string userId, string code, string storedHash)
    {
        var computed = HashCode(userId, code);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(computed),
            Encoding.UTF8.GetBytes(storedHash));
    }
}
