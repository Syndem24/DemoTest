using FluentValidation;
using TestingDemo.DTOs;
using TestingDemo.Services;

namespace TestingDemo.Validators;

public sealed class CreateBookingRequestValidator : AbstractValidator<CreateBookingRequest>
{
    public CreateBookingRequestValidator()
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
            .WithMessage("Check-in cannot be in the past.");

        RuleFor(x => x.CheckoutTimeUtc)
            .Must((request, checkout) => PhilippinesTime.ToUtc(checkout) > PhilippinesTime.ToUtc(request.CheckInAtUtc))
            .WithMessage("Check-out must be after check-in.");

        RuleFor(x => x.AcceptTerms)
            .Equal(true)
            .WithMessage("You must read and accept the Terms of Stay.");

        RuleFor(x => x.ExtraPersons)
            .InclusiveBetween(0, 1)
            .WithMessage("Extra person is limited to one on a single room.");

        RuleFor(x => x.Items)
            .NotEmpty()
            .Must(items => items.Count <= 10)
            .WithMessage("A booking can contain at most 10 room selections.");

        RuleForEach(x => x.Items)
            .SetValidator(new CreateBookingItemRequestValidator());
    }
}

public sealed class CreateBookingItemRequestValidator : AbstractValidator<CreateBookingItemRequest>
{
    public CreateBookingItemRequestValidator()
    {
        RuleFor(x => x.RoomTypeId).GreaterThan(0);
        RuleFor(x => x.Quantity).InclusiveBetween(1, 20);
    }
}
