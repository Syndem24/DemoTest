using FluentValidation;
using TestingDemo.Models;

namespace TestingDemo.Validators;

public class CreateRoomsDtoValidator : AbstractValidator<CreateRoomsDto>
{
    public CreateRoomsDtoValidator()
    {
        RuleFor(x => x.TypeName)
            .NotEmpty().WithMessage("Room type is required.")
            .MaximumLength(100);

        RuleFor(x => x.Description)
            .MaximumLength(5000);

        RuleFor(x => x.PricePerNight)
            .GreaterThan(0).WithMessage("Price must be greater than zero.");

        RuleFor(x => x.MaxOccupancy)
            .GreaterThan(0).WithMessage("Max occupancy must be at least 1.");

        RuleFor(x => x.BedCount)
            .GreaterThan(0).WithMessage("Bed count must be at least 1.");

        RuleFor(x => x.RoomNumbers)
            .NotEmpty().WithMessage("At least one room number must be assigned.")
            .Must(numbers => numbers.Count <= 50)
            .WithMessage("You can create up to 50 rooms at once.");

        RuleForEach(x => x.RoomNumbers)
            .NotEmpty().WithMessage("Each room must have a room number assigned.")
            .MaximumLength(20);

        RuleFor(x => x.RoomNumbers)
            .Must(numbers => numbers.Distinct(StringComparer.OrdinalIgnoreCase).Count() == numbers.Count)
            .WithMessage("Each room number must be unique.");
    }
}
