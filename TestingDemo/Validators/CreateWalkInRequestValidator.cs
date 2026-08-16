using FluentValidation;
using TestingDemo.DTOs;
using TestingDemo.Services;

namespace TestingDemo.Validators;

public sealed class CreateWalkInRequestValidator : AbstractValidator<CreateWalkInRequest>
{
    public CreateWalkInRequestValidator()
    {
        RuleFor(x => x.GuestName)
            .NotEmpty()
            .MaximumLength(120);

        RuleFor(x => x.GuestEmail)
            .NotEmpty()
            .EmailAddress()
            .MaximumLength(254);

        RuleFor(x => x.GuestPhone)
            .NotEmpty()
            .MaximumLength(40)
            .Matches(@"^[+\d][\d\s\-().]*$")
            .WithMessage("Enter a valid phone number.");

        RuleFor(x => x.CheckInAtUtc)
            .Must(date => PhilippinesTime.ToUtc(date) >= PhilippinesTime.StartOfTodayUtc())
            .WithMessage("Check-in cannot be before today.");

        RuleFor(x => x.CheckoutTimeUtc)
            .Must((request, checkout) =>
                PhilippinesTime.ToUtc(checkout) > PhilippinesTime.ToUtc(request.CheckInAtUtc))
            .WithMessage("Check-out must be after check-in.");

        RuleFor(x => x.Assignments)
            .NotEmpty()
            .WithMessage("Assign at least one room for the walk-in.");

        RuleFor(x => x.ExtraPersons)
            .InclusiveBetween(0, 1)
            .WithMessage("Only one extra guest is allowed (₱200 / night).");

        RuleForEach(x => x.Assignments).ChildRules(assignment =>
        {
            assignment.RuleFor(a => a.RoomTypeId).GreaterThan(0);
            assignment.RuleFor(a => a.RoomIds)
                .NotEmpty()
                .WithMessage("Select a room number for each room type.");
        });
    }
}
