using FluentValidation;
using TestingDemo.Models;

namespace TestingDemo.Validators;

public class CreateRoomDtoValidator : AbstractValidator<CreateRoomDto>
{
    public CreateRoomDtoValidator()
    {
        RuleFor(x => x.TypeName)
            .NotEmpty().WithMessage("Room type is required.")
            .MaximumLength(100);

        RuleFor(x => x.RoomNumber)
            .NotEmpty().WithMessage("Room number is required.")
            .MaximumLength(20);

        RuleFor(x => x.Description)
            .MaximumLength(1000);

        RuleFor(x => x.PricePerNight)
            .GreaterThan(0).WithMessage("Price must be greater than zero.");

        RuleFor(x => x.MaxOccupancy)
            .GreaterThan(0).WithMessage("Max occupancy must be at least 1.");

        RuleFor(x => x.BedCount)
            .GreaterThan(0).WithMessage("Bed count must be at least 1.");
    }
}
