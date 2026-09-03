using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Models;
using TestingDemo.ViewModels;

namespace TestingDemo.Services;

public sealed class StaffAccountCreateResult
{
    public bool CollisionOrIdentityFailure { get; init; }
    public bool StepUpFailed { get; init; }
    public bool InvalidRole { get; init; }
    public bool InvalidBirthDate { get; init; }
    public string? FailureField { get; init; }
    public string? FailureMessage { get; init; }
    public IReadOnlyList<string> PasswordErrors { get; init; } = Array.Empty<string>();
    public ApplicationUser? User { get; init; }
}

public interface IStaffAccountCreateService
{
    Task<StaffAccountCreateResult> CreateAsync(
        CreateStaffUserDto dto,
        ApplicationUser actor,
        Func<string, string> verifyUrlFactory,
        CancellationToken cancellationToken);
}

public sealed class StaffAccountCreateService : IStaffAccountCreateService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly HotelBookingDbContext _db;
    private readonly IGoogleVerificationTokenService _tokens;
    private readonly IStaffOnboardingEmailSender _email;
    private readonly ILogger<StaffAccountCreateService> _logger;
    private readonly ISystemAuditRecorder _audit;

    public StaffAccountCreateService(
        UserManager<ApplicationUser> userManager,
        HotelBookingDbContext db,
        IGoogleVerificationTokenService tokens,
        IStaffOnboardingEmailSender email,
        ILogger<StaffAccountCreateService> logger,
        ISystemAuditRecorder audit)
    {
        _userManager = userManager;
        _db = db;
        _tokens = tokens;
        _email = email;
        _logger = logger;
        _audit = audit;
    }

    public async Task<StaffAccountCreateResult> CreateAsync(
        CreateStaffUserDto dto,
        ApplicationUser actor,
        Func<string, string> verifyUrlFactory,
        CancellationToken cancellationToken)
    {
        if (!AppRoles.StaffAssignable.Contains(dto.Role))
            return new StaffAccountCreateResult { InvalidRole = true };

        if (string.Equals(dto.Role, AppRoles.AdminManager, StringComparison.Ordinal))
        {
            if (string.IsNullOrEmpty(dto.CurrentAdminPassword)
                || !await _userManager.CheckPasswordAsync(actor, dto.CurrentAdminPassword))
            {
                return new StaffAccountCreateResult { StepUpFailed = true };
            }
        }

        var email = dto.LoginEmail.Trim();
        var normalizedEmail = _userManager.NormalizeEmail(email);
        var userName = dto.UserName.Trim();
        var phone = dto.PhoneNumber.Trim();
        var fullName = dto.FullName.Trim();
        var address = dto.Address.Trim();
        var birthDate = dto.BirthDate;

        if (birthDate > DateOnly.FromDateTime(DateTime.UtcNow.Date.AddYears(-16))
            || birthDate < DateOnly.FromDateTime(DateTime.UtcNow.Date.AddYears(-100)))
        {
            return new StaffAccountCreateResult { InvalidBirthDate = true };
        }

        if (await _userManager.FindByNameAsync(userName) is not null)
        {
            _logger.LogInformation(
                "CreateStaffUser rejected for existing username by {Actor}.",
                actor.UserName);
            return new StaffAccountCreateResult
            {
                CollisionOrIdentityFailure = true,
                FailureField = "userName",
                FailureMessage = "Username is already used. Choose another username."
            };
        }

        if (await _userManager.FindByEmailAsync(email) is not null
            || await _db.Users.AnyAsync(
                u => u.NormalizedGoogleEmail == normalizedEmail,
                cancellationToken))
        {
            _logger.LogInformation(
                "CreateStaffUser rejected for existing email by {Actor}.",
                actor.UserName);
            return new StaffAccountCreateResult
            {
                CollisionOrIdentityFailure = true,
                FailureField = "loginEmail",
                FailureMessage = "Email is already used by another staff account."
            };
        }

        var tempPassword = dto.TemporaryPassword;
        if (string.IsNullOrWhiteSpace(tempPassword)
            || !string.Equals(tempPassword, dto.ConfirmTemporaryPassword, StringComparison.Ordinal))
        {
            return new StaffAccountCreateResult
            {
                PasswordErrors = ["Enter and confirm the same temporary password."]
            };
        }

        var user = new ApplicationUser
        {
            UserName = userName,
            Email = email,
            EmailConfirmed = true,
            PhoneNumber = phone,
            PhoneNumberConfirmed = false,
            FullName = fullName,
            BirthDate = birthDate,
            Address = address,
            MustChangePassword = true,
            GoogleEmail = email,
            NormalizedGoogleEmail = normalizedEmail,
            GoogleVerificationStatus = GoogleVerificationStatus.PendingGoogleVerification
        };

        var passwordErrors = new List<string>();
        foreach (var validator in _userManager.PasswordValidators)
        {
            var passwordCheck = await validator.ValidateAsync(_userManager, user, tempPassword);
            if (!passwordCheck.Succeeded)
            {
                passwordErrors.AddRange(passwordCheck.Errors.Select(error => error.Description));
            }
        }

        if (passwordErrors.Count > 0)
        {
            return new StaffAccountCreateResult { PasswordErrors = passwordErrors };
        }

        var create = await _userManager.CreateAsync(user, tempPassword);
        if (!create.Succeeded)
        {
            if (create.Errors.Any(error => error.Code.StartsWith("Password", StringComparison.Ordinal)))
            {
                return new StaffAccountCreateResult
                {
                    PasswordErrors = create.Errors.Select(error => error.Description).ToArray()
                };
            }

            if (create.Errors.Any(error => error.Code == "DuplicateUserName"))
            {
                return new StaffAccountCreateResult
                {
                    CollisionOrIdentityFailure = true,
                    FailureField = "userName",
                    FailureMessage = "Username is already used. Choose another username."
                };
            }

            if (create.Errors.Any(error => error.Code == "DuplicateEmail"))
            {
                return new StaffAccountCreateResult
                {
                    CollisionOrIdentityFailure = true,
                    FailureField = "loginEmail",
                    FailureMessage = "Email is already used by another staff account."
                };
            }

            _logger.LogWarning(
                "CreateStaffUser Identity failure for actor {Actor}: {Errors}",
                actor.UserName,
                string.Join("; ", create.Errors.Select(e => e.Description)));
            return new StaffAccountCreateResult
            {
                CollisionOrIdentityFailure = true,
                FailureMessage = "Could not create this staff user. Check the details and try again."
            };
        }

        await _userManager.AddToRoleAsync(user, dto.Role);

        _audit.Record(
            SystemAuditIntent.AdministrativeAction,
            SystemAuditDomain.Account,
            StaffAccountActivityMapper.ToAccountAction("Created"),
            StaffAuthSchema.AuditTargetType,
            user.Id,
            string.IsNullOrWhiteSpace(user.FullName) ? user.UserName ?? user.Id : user.FullName,
            summary: $"Staff account created · role {dto.Role}.",
            actorUserId: actor.Id,
            actorDisplayName: actor.FullName ?? actor.UserName);
        await _db.SaveChangesAsync(cancellationToken);

        var token = _tokens.CreateToken(user.Id);
        var verifyUrl = verifyUrlFactory(token);
        await _email.SendOnboardingAsync(user, tempPassword, verifyUrl, cancellationToken);

        _logger.LogInformation(
            "Staff account created. Actor={ActorId} Target={TargetId} Role={Role} AtUtc={At:o}",
            actor.Id,
            user.Id,
            dto.Role,
            DateTime.UtcNow);

        return new StaffAccountCreateResult { User = user };
    }
}
