---
name: stay-fees
description: >-
  Implements and maintains Mori stay fees: early check-in, late checkout, and
  extra person charges with persisted BookingCharge rows, total recalculation,
  and admin/walk-in/guest UI. Use when editing early check-in, late checkout,
  extra person, stay fees, time fees, StayTimeFees, BookingCharge, price
  breakdown fees, or receptionist fee toggles.
---

# Stay fees (early / late / extra person)

## Rules (do not invent new rates unless asked)

| Fee | Rate | Constraints |
|-----|------|-------------|
| Early check-in | ₱500 / room | **Only 11:30 AM** Manila (`StayTimeFees.EarlyCheckInTime`) |
| Late checkout | ₱100 / hour / room | Max **3** hours past noon |
| Extra person | ₱200 / night | Max **1**; only when booking has a **single** room (`MaxOccupancy == 1` or name contains "Single") |

Default check-in **14:00**, default checkout **12:00**. Selecting a fee **changes stored times** and shows an **extended-time** indicator in admin details.

**Nights** = Manila calendar checkout date − check-in date (never `Ceiling(TotalDays)`). Early 11:30 / late hours must not add a second night.

## Persistence

- Store line items on `BookingCharge` (`EarlyCheckIn` | `LateCheckout` | `ExtraPerson`)
- `TotalAmount` = room stay + sum of charges; balance follows payments
- Rebuild via `ReplaceCharges` / `RecalculateTotals` in `BookingService` — do not only bump `TotalAmount` without charge rows
- Schema: EF migration + `DatabaseBootstrap.EnsureBookingChargeTable`

## Surfaces

| Surface | Behavior |
|---------|----------|
| Admin booking details | Stay fees panel → `PUT /api/admin/bookings/{id}/charges` |
| Walk-in | Time selects + optional extra-person checkbox → create payload |
| Guest booking | Time selects; create persists time fees when 11:30 / late hours chosen |

## Key files

- `Services/StayTimeFees.cs` — rates + Manila time helpers
- `Models/BookingCharge.cs`, `Models/Booking.cs` (`Charges`)
- `Services/BookingService.cs` — `UpdateChargesAsync`, create/update charge sync
- `DTOs/BookingDtos.cs` — `BookingChargeDto`, `UpdateBookingChargesRequest`
- `Controllers/AdminBookingsApiController.cs` — charges endpoint
- `wwwroot/js/admin-bookings.js` — fees panel, badges, breakdown
- `wwwroot/js/walk-in.js`, `Views/Shared/_AdminWalkInModals.cshtml`
- `wwwroot/js/booking-ui.js` — guest early/late options (11:30 only for paid early)

## Do / Don't

- Do keep guest + walk-in + admin rates aligned with `StayTimeFees`
- Do show fees in price breakdown as recorded lines
- Do include `Charges` (and room type meta for single detection) when mapping booking details
- Don't add early slots other than 11:30
- Don't allow extra person on non-single rooms
- Don't treat fees as payment records — charges are amounts owed, payments are collections

## Verify

1. Restart app (create `BookingCharge` table)
2. Admin → Bookings → details → toggle fees → Save → total/balance update; badges on stay
3. Walk-in with early 11:30 + optional extra on single → confirm total includes fees
4. Hard-refresh if JS/CSS cached
