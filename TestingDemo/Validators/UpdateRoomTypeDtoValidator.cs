using FluentValidation;
using TestingDemo.Models;

namespace TestingDemo.Validators;

public class UpdateRoomTypeDtoValidator : AbstractValidator<UpdateRoomTypeDto>
{
    public UpdateRoomTypeDtoValidator()
    {
        RuleFor(x => x.RoomTypeId)
            .GreaterThan(0);

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Room type is required.")
            .MaximumLength(100);

        RuleFor(x => x.Description)
            .MaximumLength(5000);

        RuleFor(x => x.PricePerNight)
            .GreaterThan(0).WithMessage("Price must be greater than zero.");

        RuleFor(x => x.MaxOccupancy)
            .InclusiveBetween(1, 20);

        RuleFor(x => x.BedCount)
            .InclusiveBetween(1, 10);

        RuleFor(x => x.RoomNumbers)
            .NotEmpty().WithMessage("At least one room number is required.")
            .Must(items => items.Count is >= 1 and <= 50)
            .WithMessage("A room type can have between 1 and 50 rooms.")
            .Must(items => items.All(i => i.RoomId >= 0 && !string.IsNullOrWhiteSpace(i.RoomNumber)))
            .WithMessage("Each room must have a room number.")
            .Must(items => items.Select(i => i.RoomNumber.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count() == items.Count)
            .WithMessage("Each room number must be unique.");

        RuleForEach(x => x.RoomNumbers)
            .ChildRules(room =>
            {
                room.RuleFor(r => r.RoomNumber)
                    .MaximumLength(20);
            });
    }
}
