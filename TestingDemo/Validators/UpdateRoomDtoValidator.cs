using FluentValidation;
using TestingDemo.Models;

namespace TestingDemo.Validators;

public class UpdateRoomDtoValidator : AbstractValidator<UpdateRoomDto>
{
    public UpdateRoomDtoValidator()
    {
        RuleFor(x => x.Id)
            .GreaterThan(0);

        RuleFor(x => x.RoomTypeId)
            .GreaterThan(0);

        RuleFor(x => x.TypeName)
            .NotEmpty().WithMessage("Room type is required.")
            .MaximumLength(100);

        RuleFor(x => x.RoomNumber)
            .NotEmpty().WithMessage("Room number is required.")
            .MaximumLength(20);

        RuleFor(x => x.Description)
            .MaximumLength(5000);

        RuleFor(x => x.PricePerNight)
            .GreaterThan(0).WithMessage("Price must be greater than zero.");

        RuleFor(x => x.MaxOccupancy)
            .GreaterThan(0).WithMessage("Max occupancy must be at least 1.");

        RuleFor(x => x.BedCount)
            .GreaterThan(0).WithMessage("Bed count must be at least 1.");
    }
}
