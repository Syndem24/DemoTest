using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.DTOs;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Controllers;

[Authorize(Roles = "AdminManager,Receptionist")]
public class AdminSpecialOffersController : Controller
{
    private readonly ISpecialOfferService _offers;
    private readonly HotelBookingDbContext _db;

    public AdminSpecialOffersController(ISpecialOfferService offers, HotelBookingDbContext db)
    {
        _offers = offers;
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> Index(CancellationToken cancellationToken)
    {
        ViewData["Title"] = "Special offers";
        ViewBag.CanManageOffers = User.IsInRole(AppRoles.AdminManager);
        var list = User.IsInRole(AppRoles.AdminManager)
            ? await _offers.GetAllAsync(cancellationToken)
            : await _offers.GetCurrentAsync(cancellationToken);
        return View(list);
    }

    [HttpGet]
    [Authorize(Roles = AppRoles.AdminManager)]
    public async Task<IActionResult> Create(CancellationToken cancellationToken)
    {
        ViewData["Title"] = "Create special offer";
        await PopulateRoomTypesAsync(cancellationToken);
        var firstId = await _db.RoomTypes.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => t.RoomTypeId)
            .FirstOrDefaultAsync(cancellationToken);

        var starts = TruncateToMinute(PhilippinesTime.NowManila());
        return View(new UpsertSpecialOfferRequest
        {
            RoomTypeIds = firstId > 0 ? [firstId] : [],
            RoomTypeId = firstId,
            Kind = SpecialOfferKind.LimitedTime,
            Description = string.Empty,
            DiscountPercent = 25m,
            Channels = SpecialOfferChannels.OnlineVisible | SpecialOfferChannels.WalkIn,
            CashOnly = true,
            IsActive = true,
            LoyaltyApplyMode = LoyaltyApplyMode.EveryNight,
            StartsAtUtc = starts,
            EndsAtUtc = starts.AddDays(14)
        });
    }

    [HttpPost]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Create(UpsertSpecialOfferRequest model, CancellationToken cancellationToken)
    {
        ViewData["Title"] = "Create special offer";
        await PopulateRoomTypesAsync(cancellationToken);
        ClearDerivedPriceValidation(model);
        if (!ModelState.IsValid)
            return View(model);

        try
        {
            var created = await _offers.CreateAsync(model, cancellationToken);
            TempData["Success"] = created.Count == 1
                ? "Special offer created."
                : $"Special offer created for {created.Count} room types.";
            return RedirectToAction(nameof(Index));
        }
        catch (ArgumentException ex)
        {
            ModelState.AddModelError(string.Empty, ex.Message);
            return View(model);
        }
    }

    [HttpGet]
    [Authorize(Roles = AppRoles.AdminManager)]
    public async Task<IActionResult> Edit(int id, CancellationToken cancellationToken)
    {
        ViewData["Title"] = "Edit special offer";
        var dto = await _offers.GetByIdAsync(id, cancellationToken);
        if (dto is null) return NotFound();
        ViewBag.CanReactivate = !dto.IsActive;
        await PopulateRoomTypesAsync(cancellationToken);
        var roomTypeIds = await _offers.GetSiblingRoomTypeIdsAsync(id, cancellationToken);
        // Deactivated offers start with empty window so staff pick a fresh Manila range.
        var starts = dto.IsActive
            ? TruncateToMinute(PhilippinesTime.ToManila(dto.StartsAtUtc))
            : default;
        var ends = dto.IsActive && !dto.OpenEnded
            ? TruncateToMinute(PhilippinesTime.ToManila(dto.EndsAtUtc))
            : default;
        return View(new UpsertSpecialOfferRequest
        {
            RoomTypeIds = roomTypeIds.ToList(),
            RoomTypeId = dto.RoomTypeId,
            Kind = dto.Kind,
            Description = dto.Description,
            DiscountPercent = SpecialOfferService.IsPercentRateKind(dto.Kind)
                ? DeriveDiscountPercent(dto.RegularPricePerNight, dto.PromoPricePerNight)
                : null,
            DiscountAmount = SpecialOfferService.IsFixedAmountKind(dto.Kind)
                ? DeriveDiscountAmount(dto.RegularPricePerNight, dto.PromoPricePerNight)
                : null,
            LoyaltyApplyMode = dto.LoyaltyApplyMode,
            OpenEnded = dto.OpenEnded,
            MinNights = dto.MinNights,
            RegularPricePerNight = dto.RegularPricePerNight,
            PromoPricePerNight = dto.PromoPricePerNight,
            Channels = dto.Channels,
            CashOnly = dto.CashOnly,
            IsActive = dto.IsActive,
            StartsAtUtc = starts,
            EndsAtUtc = dto.OpenEnded ? default : ends
        });
    }

    [HttpPost]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Edit(
        int id,
        UpsertSpecialOfferRequest model,
        string? intent,
        CancellationToken cancellationToken)
    {
        ViewData["Title"] = "Edit special offer";
        var existing = await _offers.GetByIdAsync(id, cancellationToken);
        if (existing is null) return NotFound();
        var canReactivate = !existing.IsActive;
        ViewBag.CanReactivate = canReactivate;

        // Reactivate button: save fields then immediately activate this offer.
        if (canReactivate && string.Equals(intent, "reactivate", StringComparison.OrdinalIgnoreCase))
            model.IsActive = true;

        await PopulateRoomTypesAsync(cancellationToken);
        ClearDerivedPriceValidation(model);
        if (!ModelState.IsValid)
            return View(model);

        try
        {
            var updated = await _offers.UpdateAsync(id, model, cancellationToken);
            if (updated is null) return NotFound();
            TempData["Success"] =
                canReactivate && string.Equals(intent, "reactivate", StringComparison.OrdinalIgnoreCase)
                    ? "Special offer reactivated."
                    : "Special offer updated.";
            return RedirectToAction(nameof(Index));
        }
        catch (ArgumentException ex)
        {
            ModelState.AddModelError(string.Empty, ex.Message);
            return View(model);
        }
    }

    [HttpPost]
    [Authorize(Roles = AppRoles.AdminManager)]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Deactivate(int id, CancellationToken cancellationToken)
    {
        await _offers.DeactivateAsync(id, cancellationToken);
        TempData["Success"] = "Special offer deactivated.";
        return RedirectToAction(nameof(Index));
    }

    private void ClearDerivedPriceValidation(UpsertSpecialOfferRequest model)
    {
        ModelState.Remove(nameof(model.RegularPricePerNight));
        ModelState.Remove(nameof(model.PromoPricePerNight));
        ModelState.Remove(nameof(model.RoomTypeId));
        ModelState.Remove(nameof(model.Title));
        model.Title = SpecialOfferService.TitleForKind(model.Kind);
        if (!SpecialOfferService.IsPercentRateKind(model.Kind))
            ModelState.Remove(nameof(model.DiscountPercent));
        if (!SpecialOfferService.IsFixedAmountKind(model.Kind))
            ModelState.Remove(nameof(model.DiscountAmount));
        if (model.Kind != SpecialOfferKind.StayLongerSaveMore)
            ModelState.Remove(nameof(model.MinNights));
        ModelState.Remove(nameof(model.LoyaltyApplyMode));
    }

    private async Task PopulateRoomTypesAsync(CancellationToken cancellationToken)
    {
        var types = await _db.RoomTypes.AsNoTracking()
            .OrderBy(t => t.Name)
            .Select(t => new RoomTypePriceOption
            {
                RoomTypeId = t.RoomTypeId,
                Name = t.Name,
                PricePerNight = t.PricePerNight
            })
            .ToListAsync(cancellationToken);
        ViewBag.RoomTypeOptions = types;
        ViewBag.RoomTypePricesJson = JsonSerializer.Serialize(
            types.ToDictionary(t => t.RoomTypeId.ToString(), t => t.PricePerNight));
    }

    private static decimal? DeriveDiscountPercent(decimal regular, decimal? promo)
    {
        if (promo is not decimal p || regular <= 0 || p <= 0 || p >= regular)
            return null;
        return decimal.Round((1m - p / regular) * 100m, 2, MidpointRounding.AwayFromZero);
    }

    private static decimal? DeriveDiscountAmount(decimal regular, decimal? promo)
    {
        if (promo is not decimal p || regular <= 0 || p <= 0 || p >= regular)
            return null;
        return decimal.Round(regular - p, 2, MidpointRounding.AwayFromZero);
    }

    private static DateTime TruncateToMinute(DateTime value) =>
        new(value.Year, value.Month, value.Day, value.Hour, value.Minute, 0, DateTimeKind.Unspecified);
}
