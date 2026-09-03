using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using TestingDemo.Models;

namespace TestingDemo.Services;

public sealed class IdentityBootstrapOptions
{
    public const string SectionName = "Identity";

    /// <summary>When false, first-run AdminManager seed never runs (use in production after bootstrap).</summary>
    public bool AllowBootstrapSeed { get; set; } = true;
}

public interface IAdminManagerSeed
{
    Task EnsureAsync(CancellationToken cancellationToken = default);
}

public sealed class AdminManagerSeed : IAdminManagerSeed
{
    private readonly UserManager<ApplicationUser> _users;
    private readonly RoleManager<IdentityRole> _roles;
    private readonly IOptions<IdentityBootstrapOptions> _options;
    private readonly ILogger<AdminManagerSeed> _logger;

    public AdminManagerSeed(
        UserManager<ApplicationUser> users,
        RoleManager<IdentityRole> roles,
        IOptions<IdentityBootstrapOptions> options,
        ILogger<AdminManagerSeed> logger)
    {
        _users = users;
        _roles = roles;
        _options = options;
        _logger = logger;
    }

    public async Task EnsureAsync(CancellationToken cancellationToken = default)
    {
        await EnsureRoleAsync(AppRoles.AdminManager);
        await EnsureRoleAsync(AppRoles.Receptionist);
        await EnsureRoleAsync(AppRoles.Guest);

        if (!_options.Value.AllowBootstrapSeed)
        {
            _logger.LogInformation("AdminManager seed skipped: Identity:AllowBootstrapSeed is false.");
            return;
        }

        var admins = await _users.GetUsersInRoleAsync(AppRoles.AdminManager);
        if (admins.Count > 0)
        {
            _logger.LogInformation(
                "AdminManager seed skipped: {Count} AdminManager account(s) already exist.",
                admins.Count);
            return;
        }

        var tempPassword = TemporaryPassword.Generate(_users.Options.Password);
        var user = new ApplicationUser
        {
            UserName = "admin.manager",
            Email = "admin.manager@local",
            EmailConfirmed = true,
            MustChangePassword = true,
            GoogleVerificationStatus = GoogleVerificationStatus.NotLinked
        };

        var create = await _users.CreateAsync(user, tempPassword);
        if (!create.Succeeded)
        {
            throw new InvalidOperationException(
                "AdminManager seed failed: " + string.Join("; ", create.Errors.Select(e => e.Description)));
        }

        await _users.AddToRoleAsync(user, AppRoles.AdminManager);

        // One-time retrieve — logger category AdminManagerSeed / console. Never commit or put in appsettings.
        _logger.LogWarning(
            "FIRST-RUN AdminManager created. Username={UserName}. TemporaryPassword={Password}. Change this password on first login.",
            user.UserName,
            tempPassword);
        Console.WriteLine();
        Console.WriteLine("======== FIRST-RUN ADMIN CREDENTIALS ========");
        Console.WriteLine($"Username: {user.UserName}");
        Console.WriteLine($"Temporary password: {tempPassword}");
        Console.WriteLine("Change password on first login. This will not be shown again.");
        Console.WriteLine("=============================================");
        Console.WriteLine();
    }

    private async Task EnsureRoleAsync(string roleName)
    {
        if (await _roles.RoleExistsAsync(roleName))
            return;

        var result = await _roles.CreateAsync(new IdentityRole(roleName));
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Failed to create role {roleName}: " + string.Join("; ", result.Errors.Select(e => e.Description)));
        }
    }
}
