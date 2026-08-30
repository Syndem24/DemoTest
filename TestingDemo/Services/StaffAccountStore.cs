using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;

namespace TestingDemo.Services;

/// <summary>
/// Identity user store that keeps the staff role on <see cref="ApplicationUser.RoleId"/>
/// so login does not need StaffAccountRole / claim tables.
/// </summary>
public sealed class StaffAccountStore : UserStore<ApplicationUser, IdentityRole, HotelBookingDbContext>
{
    public StaffAccountStore(HotelBookingDbContext context, IdentityErrorDescriber describer)
        : base(context, describer)
    {
    }

    public override async Task AddToRoleAsync(
        ApplicationUser user,
        string normalizedRoleName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(user);
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedRoleName);

        var role = await FindRoleAsync(normalizedRoleName, cancellationToken)
            ?? throw new InvalidOperationException($"Role '{normalizedRoleName}' was not found.");
        user.RoleId = role.Id;
    }

    public override async Task RemoveFromRoleAsync(
        ApplicationUser user,
        string normalizedRoleName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(user);
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedRoleName);

        var role = await FindRoleAsync(normalizedRoleName, cancellationToken);
        if (role is not null && string.Equals(user.RoleId, role.Id, StringComparison.Ordinal))
            user.RoleId = null;
    }

    public override async Task<IList<string>> GetRolesAsync(
        ApplicationUser user,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(user);

        if (string.IsNullOrEmpty(user.RoleId))
            return new List<string>();

        var name = await Context.Set<IdentityRole>()
            .AsNoTracking()
            .Where(role => role.Id == user.RoleId)
            .Select(role => role.Name)
            .FirstOrDefaultAsync(cancellationToken);

        return string.IsNullOrEmpty(name) ? new List<string>() : new List<string> { name };
    }

    public override async Task<bool> IsInRoleAsync(
        ApplicationUser user,
        string normalizedRoleName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentNullException.ThrowIfNull(user);
        if (string.IsNullOrWhiteSpace(normalizedRoleName) || string.IsNullOrEmpty(user.RoleId))
            return false;

        var role = await FindRoleAsync(normalizedRoleName, cancellationToken);
        return role is not null && string.Equals(user.RoleId, role.Id, StringComparison.Ordinal);
    }

    public override async Task<IList<ApplicationUser>> GetUsersInRoleAsync(
        string normalizedRoleName,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ArgumentException.ThrowIfNullOrWhiteSpace(normalizedRoleName);

        var role = await FindRoleAsync(normalizedRoleName, cancellationToken);
        if (role is null)
            return new List<ApplicationUser>();

        return await Users.Where(user => user.RoleId == role.Id).ToListAsync(cancellationToken);
    }

    public override Task<IList<Claim>> GetClaimsAsync(
        ApplicationUser user,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(user);
        return Task.FromResult<IList<Claim>>(new List<Claim>());
    }

    public override Task AddClaimsAsync(
        ApplicationUser user,
        IEnumerable<Claim> claims,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(claims);
        return Task.CompletedTask;
    }

    public override Task ReplaceClaimAsync(
        ApplicationUser user,
        Claim claim,
        Claim newClaim,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(claim);
        ArgumentNullException.ThrowIfNull(newClaim);
        return Task.CompletedTask;
    }

    public override Task RemoveClaimsAsync(
        ApplicationUser user,
        IEnumerable<Claim> claims,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(user);
        ArgumentNullException.ThrowIfNull(claims);
        return Task.CompletedTask;
    }

    public override Task<IList<ApplicationUser>> GetUsersForClaimAsync(
        Claim claim,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(claim);
        return Task.FromResult<IList<ApplicationUser>>(new List<ApplicationUser>());
    }
}
