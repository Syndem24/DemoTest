using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using TestingDemo.Data;

namespace TestingDemo.Services;

/// <summary>
/// Identity role store that does not use StaffRoleClaim (unused in this hotel).
/// </summary>
public sealed class StaffRoleStore : RoleStore<IdentityRole, HotelBookingDbContext>
{
    public StaffRoleStore(HotelBookingDbContext context, IdentityErrorDescriber describer)
        : base(context, describer)
    {
    }

    public override Task<IList<Claim>> GetClaimsAsync(
        IdentityRole role,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(role);
        return Task.FromResult<IList<Claim>>(new List<Claim>());
    }

    public override Task AddClaimAsync(
        IdentityRole role,
        Claim claim,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(role);
        ArgumentNullException.ThrowIfNull(claim);
        return Task.CompletedTask;
    }

    public override Task RemoveClaimAsync(
        IdentityRole role,
        Claim claim,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(role);
        ArgumentNullException.ThrowIfNull(claim);
        return Task.CompletedTask;
    }
}
