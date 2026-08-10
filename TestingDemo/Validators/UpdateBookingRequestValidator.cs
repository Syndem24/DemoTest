using FluentValidation;
using TestingDemo.DTOs;
using TestingDemo.Services;

namespace TestingDemo.Validators;

public sealed class UpdateBookingRequestValidator : AbstractValidator<UpdateBookingRequest>
{
    public UpdateBookingRequestValidator()
    {
        RuleFor(x => x.GuestName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.GuestEmail).NotEmpty().EmailAddress().MaximumLength(254);
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
        RuleFor(x => x.PaymentOption)
            .IsInEnum()
            .When(x => x.PaymentOption.HasValue)
            .WithMessage("Choose full payment or half payment.");
        RuleFor(x => x.Items)
            .NotEmpty()
            .Must(items => items.Any(item => item.Quantity > 0))
            .WithMessage("Keep at least one room in the booking.");
        RuleForEach(x => x.Items).SetValidator(new UpdateBookingItemValidator());
    }
}
public sealed class UpdateBookingItemValidator : AbstractValidator<CreateBookingItemRequest>
{
    public UpdateBookingItemValidator()
    {
        RuleFor(x => x.RoomTypeId).GreaterThan(0);
        RuleFor(x => x.Quantity).InclusiveBetween(0, 20);
    }
}
