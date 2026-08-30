using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface ISecureConfigStore
{
    Task<string?> GetAsync(string key, CancellationToken cancellationToken = default);
    Task<bool> HasValueAsync(string key, CancellationToken cancellationToken = default);
    Task SetAsync(string key, string value, CancellationToken cancellationToken = default);
    Task RemoveAsync(string key, CancellationToken cancellationToken = default);
}

public sealed class SecureConfigStore : ISecureConfigStore
{
    public const string ProtectorPurpose = "HotelBookingSystem.SecureConfig.v1";
    private const string CacheKey = "secure-config:v1";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    private readonly HotelBookingDbContext _db;
    private readonly IDataProtector _protector;
    private readonly IMemoryCache _cache;

    public SecureConfigStore(
        HotelBookingDbContext db,
        IDataProtectionProvider dataProtection,
        IMemoryCache cache)
    {
        _db = db;
        _protector = dataProtection.CreateProtector(ProtectorPurpose);
        _cache = cache;
    }

    public async Task<string?> GetAsync(string key, CancellationToken cancellationToken = default)
    {
        var map = await LoadAsync(cancellationToken);
        return map.TryGetValue(key, out var value) ? value : null;
    }

    public async Task<bool> HasValueAsync(string key, CancellationToken cancellationToken = default)
    {
        var value = await GetAsync(key, cancellationToken);
        return !string.IsNullOrWhiteSpace(value);
    }

    public async Task SetAsync(string key, string value, CancellationToken cancellationToken = default)
    {
        var ciphertext = _protector.Protect(value);
        var row = await _db.SecureSettings.FirstOrDefaultAsync(s => s.Key == key, cancellationToken);
        if (row is null)
        {
            _db.SecureSettings.Add(new SecureSetting
            {
                Key = key,
                Ciphertext = ciphertext,
                UpdatedUtc = DateTime.UtcNow
            });
        }
        else
        {
            row.Ciphertext = ciphertext;
            row.UpdatedUtc = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
        _cache.Remove(CacheKey);
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        var row = await _db.SecureSettings.FirstOrDefaultAsync(s => s.Key == key, cancellationToken);
        if (row is null)
            return;

        _db.SecureSettings.Remove(row);
        await _db.SaveChangesAsync(cancellationToken);
        _cache.Remove(CacheKey);
    }

    private async Task<Dictionary<string, string>> LoadAsync(CancellationToken cancellationToken)
    {
        if (_cache.TryGetValue(CacheKey, out Dictionary<string, string>? cached) && cached is not null)
            return cached;

        var rows = await _db.SecureSettings.AsNoTracking().ToListAsync(cancellationToken);
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            try
            {
                map[row.Key] = _protector.Unprotect(row.Ciphertext);
            }
            catch
            {
                // Skip values that cannot be decrypted with the current key ring.
            }
        }

        _cache.Set(CacheKey, map, CacheTtl);
        return map;
    }
}
