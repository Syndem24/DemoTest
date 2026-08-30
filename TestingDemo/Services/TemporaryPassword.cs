using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;

namespace TestingDemo.Services;

public static class TemporaryPassword
{
    private const string Lowers = "abcdefghijkmnopqrstuvwxyz";
    private const string Uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    private const string Digits = "23456789";
    private const string NonAlpha = "!@#$%^&*-_?";

    public static string Generate(PasswordOptions options)
    {
        var requiredLength = Math.Max(options.RequiredLength, 16);
        var chars = new List<char>(requiredLength);

        if (options.RequireLowercase)
            chars.Add(Pick(Lowers));
        if (options.RequireUppercase)
            chars.Add(Pick(Uppers));
        if (options.RequireDigit)
            chars.Add(Pick(Digits));
        if (options.RequireNonAlphanumeric)
            chars.Add(Pick(NonAlpha));

        var all = Lowers + Uppers + Digits + NonAlpha;
        while (chars.Count < requiredLength)
            chars.Add(Pick(all));

        // Fisher–Yates with crypto RNG
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars.ToArray());
    }

    private static char Pick(string alphabet)
    {
        var index = RandomNumberGenerator.GetInt32(alphabet.Length);
        return alphabet[index];
    }

    /// <summary>URL-safe opaque token bytes for email links.</summary>
    public static string CreateOpaqueToken(int byteLength = 32)
    {
        var bytes = new byte[byteLength];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
