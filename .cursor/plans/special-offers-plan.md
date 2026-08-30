# Special offers & discounts plan

**Status:** Implemented (2026-08-22).  
**Updated:** 2026-08-22 (decisions locked from user)

## Goal

AdminManagers CRUD multiple typed special offers per RoomType; guest offer/details modals show only **active** offers; walk-in / front-desk can use walk-in promo rates; third-party intake is walk-in-style at regular rates; Senior/PWD 20% is a **flag for arrival** after the confirm step (non-combinable with active promo); cash-only when promo requires it.

## Locked decisions

1. **Grain:** RoomType (not room number).
2. **Senior/PWD:** Flag for arrival only — no automatic −20% on online Pending totals in v1; staff verifies ID and applies at front desk.
3. **Multiple offers:** Allowed. Admin picks an **offer kind**; guest “Special offers” lists every **currently active** offer for that type. If none active → section stays empty / “No limited offers right now” (do not invent fake cards).

## Offer kinds (admin launches; guest copy)

| Kind (enum) | Guest-facing title / idea |
|-------------|---------------------------|
| `LimitedTime` | LIMITED TIME OFFER — e.g. ₱1,499/night (vs regular), WiFi, book direct / walk-in |
| `BestAvailableRate` | Best Deal: Best Available Rate — Room Only (optional admin-managed banner; baseline BAR can stay hard-coded in UI as today) |
| `BookNowStayLater` | BOOK NOW, STAY LATER — plan ahead, added discount |
| `StayLongerSaveMore` | STAY LONGER, SAVE MORE — longer stay = more save |
| `MonthlyStay` | Monthly Stay — extended stay monthly discount |

Admin can create several rows (different kinds and/or different RoomTypes). Visibility rule: `IsActive && StartsAtUtc ≤ now ≤ EndsAtUtc` (and optional channel rules).

## Assumptions

1. **Online:** Guests **see** active special offers in `#offerSelectModal` / details; checkout still uses regular `RoomType.PricePerNight` unless we later enable online-eligible offers. Walk-in-only kinds (e.g. LimitedTime cash promo) are labeled “Front desk / walk-in only” and not applied on `POST /api/bookings`.
2. **Walk-in promo** (`LimitedTime` + walk-in channel + cash-only): applied on walk-in create when eligible (snapshot promo nightly rate).
3. **Third-party** (Agoda/Expedia/RedDoorz/Other): admin manual entry like walk-in; **excluded** from walk-in LimitedTime promo; standard rate; channel stored on booking.
4. **Non-combinable:** If stay would use an active promo rate, Senior/PWD dropdown shows disabled + copy that discount applies when promo ends / on regular rate. Flag still choosable only when no promo applies to that booking path.
5. **VAT** still out of scope for v1.

## Approach

- Table `SpecialOffer`: RoomTypeId, Kind, Title, Description, RegularPricePerNight (or read from type), PromoPricePerNight?, MinNights?, Channels (flags/json), CashOnly, IsActive, StartsAtUtc, EndsAtUtc, SortOrder.
- Admin MVC CRUD + sidebar “Special offers”.
- Public API: active offers by room type for accommodations JS.
- Guest UI: replace empty special group with cards for active offers only; hide group or keep empty message when zero.
- Booking: `BookingChannel`, `SpecialOfferId?`, `ArrivalDiscountRequest` (None | Senior | Pwd) — flag only.
- Walk-in service applies promo price when channel + offer allow; payments enforce Cash when `CashOnly`.
- Third-party = extend walk-in UI/API with channel selector.

## Alternatives considered

- Single active offer per type — rejected; guest modal needs several kind cards.
- Apply Senior/PWD on Pending online total — rejected; flag for arrival only.
- Per room-number offers — rejected; RoomType locked.

## Backend patterns

- Schema + rules in `SpecialOfferService` / `BookingService`; one SQL transaction on create; migration + bootstrap.
- No queues/Redis.

## Steps (after approval)

1. Schema + migration (`SpecialOffer`, booking channel / offer / arrival-discount flag).
2. `SpecialOfferService` + Admin CRUD MVC/API.
3. Public active-offers endpoint; wire `booking-ui.js` special group (render only if count > 0).
4. Details modal badge/price note when active LimitedTime (or any) exists.
5. Walk-in: select/apply eligible offer; cash-only note; confirm Senior/PWD flag (gated).
6. Third-party intake: walk-in-like + channel; no LimitedTime walk-in promo.
7. Payments: block non-cash when booking.CashOnly / offer.CashOnly.
8. Validate click paths (below).

## Files (expected)

- `Models/SpecialOffer.cs`, `SpecialOfferKind.cs`, `Booking.cs` (+ enums)
- `Data/HotelBookingDbContext.cs`, migration
- `Services/SpecialOfferService.cs`, `BookingService.cs`, validators/DTOs
- `Controllers/AdminSpecialOffersController.cs`, optional `SpecialOffersApiController`
- `Views/AdminSpecialOffers/*`, `Views/Shared/_Layout.cshtml`
- `Views/Booking/Accommodations.cshtml`, `wwwroot/js/booking-ui.js`
- Walk-in modals + `wwwroot/js/walk-in.js` (+ third-party)
- Admin payments JS/API
- Locales

## Validation

- Admin creates LimitedTime 1499/1800 + BookNowStayLater + MonthlyStay on same type → guest special section shows all **active** ones; deactivate/end dates hide them.
- Zero active → “No limited offers right now.”
- Walk-in LimitedTime → item at 1499; cash payment required.
- Online book → regular rate; may set Senior/PWD **flag** only if no promo on that booking.
- Third-party → regular rate + channel tag.

## Out of scope (v1)

- OTA API sync  
- Auto −20% line item / VAT  
- Auth changes  
- Background job beyond EndsAt checks at read/write time  

## Research notes

- PH PWD/Senior: 20%; not combinable with each other; vs promo take establishment promo **or** 20%, not both ([IRR RA 10754 §12](https://ncda.gov.ph/disability-laws/implementing-rules-and-regulations-irr/irr-of-ra-10754-an-act-expanding-the-benefits-and-privileges-of-persons-with-disability-pwd/)).
- Code: `RoomType.PricePerNight`; `#offerSelectModal` already has Best deal + empty Special offers in `booking-ui.js`.

## Done look

- Admin launches typed offers per RoomType; guest sees only active ones in special offers UI.
- Walk-in promo + cash-only works; third-party manual at standard rate.
- Confirm step: Senior/PWD dropdown as arrival flag; blocked when promo applies.
