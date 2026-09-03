using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;
using TestingDemo.Models;

namespace TestingDemo.Services;

public interface IGoogleAuthSettings
{
    Task<bool> IsLoginButtonVisibleAsync(CancellationToken cancellationToken = default);
    Task<bool> HasCredentialsAsync(CancellationToken cancellationToken = default);
    Task<(string? ClientId, string? ClientSecret)> GetCredentialsAsync(CancellationToken cancellationToken = default);
    Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default);
    /// <summary>True when vault has usable Client ID + Secret (call before Challenge).</summary>
    Task<bool> TryApplyToOptionsAsync(CancellationToken cancellationToken = default);
    void NotifyOptionsChanged();
}

/// <summary>
/// Google OAuth Client ID/Secret + login-button flag from the Integration vault (not appsettings).
/// </summary>
public sealed class GoogleAuthSettings : IGoogleAuthSettings
{
    public const string EnabledTrue = "true";
    public const string UnconfiguredClientId = "unconfigured-client-id.apps.googleusercontent.com";
    public const string UnconfiguredClientSecret = "unconfigured-client-secret";

    private readonly ISecureConfigStore _vault;
    private readonly IOptionsMonitorCache<GoogleOptions> _optionsCache;
    private readonly IOptionsMonitor<GoogleOptions> _optionsMonitor;

    public GoogleAuthSettings(
        ISecureConfigStore vault,
        IOptionsMonitorCache<GoogleOptions> optionsCache,
        IOptionsMonitor<GoogleOptions> optionsMonitor)
    {
        _vault = vault;
        _optionsCache = optionsCache;
        _optionsMonitor = optionsMonitor;
    }

    public async Task<bool> IsEnabledAsync(CancellationToken cancellationToken = default)
    {
        var flag = await _vault.GetAsync(SecureSettingKeys.GoogleLoginEnabled, cancellationToken);
        return string.Equals(flag, EnabledTrue, StringComparison.OrdinalIgnoreCase);
    }

    public async Task<bool> HasCredentialsAsync(CancellationToken cancellationToken = default)
    {
        var (id, secret) = await GetCredentialsAsync(cancellationToken);
        return IsUsableClientId(id) && IsUsableSecret(secret);
    }

    public async Task<(string? ClientId, string? ClientSecret)> GetCredentialsAsync(
        CancellationToken cancellationToken = default)
    {
        var id = SanitizeClientId(await _vault.GetAsync(SecureSettingKeys.GoogleClientId, cancellationToken));
        var secret = SanitizeSecret(await _vault.GetAsync(SecureSettingKeys.GoogleClientSecret, cancellationToken));
        return (id, secret);
    }

    public async Task<bool> IsLoginButtonVisibleAsync(CancellationToken cancellationToken = default)
    {
        return await IsEnabledAsync(cancellationToken) && await HasCredentialsAsync(cancellationToken);
    }

    public async Task<bool> TryApplyToOptionsAsync(CancellationToken cancellationToken = default)
    {
        var (id, secret) = await GetCredentialsAsync(cancellationToken);
        if (!IsUsableClientId(id) || !IsUsableSecret(secret))
            return false;

        _optionsCache.TryRemove(GoogleDefaults.AuthenticationScheme);
        var options = _optionsMonitor.Get(GoogleDefaults.AuthenticationScheme);
        options.ClientId = id!;
        options.ClientSecret = secret!;
        options.SaveTokens = false;
        return true;
    }

    public void NotifyOptionsChanged() => _optionsCache.TryRemove(GoogleDefaults.AuthenticationScheme);

    public static bool IsUsableClientId(string? id) =>
        !string.IsNullOrWhiteSpace(id)
        && !string.Equals(id, UnconfiguredClientId, StringComparison.Ordinal)
        && id.EndsWith(".apps.googleusercontent.com", StringComparison.OrdinalIgnoreCase);

    public static bool IsUsableSecret(string? secret) =>
        !string.IsNullOrWhiteSpace(secret)
        && !string.Equals(secret, UnconfiguredClientSecret, StringComparison.Ordinal);

    internal static string? SanitizeClientId(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var value = raw.Trim().Trim('"', '\'');
        if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || value.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(value, UriKind.Absolute, out var uri))
                value = (uri.Host + uri.AbsolutePath).TrimEnd('/');
        }

        const string suffix = ".apps.googleusercontent.com";
        var first = value.IndexOf(suffix, StringComparison.OrdinalIgnoreCase);
        if (first >= 0 && value.IndexOf(suffix, first + suffix.Length, StringComparison.OrdinalIgnoreCase) >= 0)
            value = value[..(first + suffix.Length)];

        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    internal static string? SanitizeSecret(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;
        return raw.Trim().Trim('"', '\'');
    }

    public static string ReplaceClientIdInAuthorizeUrl(string redirectUri, string clientId)
    {
        var hashIndex = redirectUri.IndexOf('#');
        var withoutHash = hashIndex >= 0 ? redirectUri[..hashIndex] : redirectUri;
        var hash = hashIndex >= 0 ? redirectUri[hashIndex..] : string.Empty;

        var qIndex = withoutHash.IndexOf('?');
        if (qIndex < 0)
            return redirectUri;

        var path = withoutHash[..qIndex];
        var query = QueryHelpers.ParseQuery(withoutHash[qIndex..]);
        var map = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in query)
            map[pair.Key] = pair.Value.ToString();

        map["client_id"] = clientId;
        return QueryHelpers.AddQueryString(path, map!) + hash;
    }
}

/// <summary>
/// Loads ClientId/Secret from the Integration vault when Google options are first created (or after cache clear).
/// Does not use a change-token loop — that hung the whole site.
/// </summary>
public sealed class ConfigureGoogleOptions : IConfigureNamedOptions<GoogleOptions>
{
    private readonly IServiceScopeFactory _scopeFactory;

    public ConfigureGoogleOptions(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    public void Configure(GoogleOptions options) => Configure(GoogleDefaults.AuthenticationScheme, options);

    public void Configure(string? name, GoogleOptions options)
    {
        if (!string.Equals(name, GoogleDefaults.AuthenticationScheme, StringComparison.Ordinal))
            return;

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var vault = scope.ServiceProvider.GetRequiredService<ISecureConfigStore>();
            var id = GoogleAuthSettings.SanitizeClientId(
                vault.GetAsync(SecureSettingKeys.GoogleClientId).ConfigureAwait(false).GetAwaiter().GetResult());
            var secret = GoogleAuthSettings.SanitizeSecret(
                vault.GetAsync(SecureSettingKeys.GoogleClientSecret).ConfigureAwait(false).GetAwaiter().GetResult());

            options.ClientId = GoogleAuthSettings.IsUsableClientId(id)
                ? id!
                : GoogleAuthSettings.UnconfiguredClientId;
            options.ClientSecret = GoogleAuthSettings.IsUsableSecret(secret)
                ? secret!
                : GoogleAuthSettings.UnconfiguredClientSecret;
        }
        catch
        {
            options.ClientId = GoogleAuthSettings.UnconfiguredClientId;
            options.ClientSecret = GoogleAuthSettings.UnconfiguredClientSecret;
        }

        options.SaveTokens = false;
    }
}
