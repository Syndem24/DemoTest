---
name: booking-ui
description: >-
  Builds and revises the customer hotel booking/reservation UI (Razor, booking.css,
  booking-ui.js). Use when editing Booking page, guest hero, reserve modals, toasts,
  available rooms display, or customer layout.
---

# Booking UI skill

## Read first
- `Views/Booking/Index.cshtml`
- `Views/Shared/_CustomerLayout.cshtml`
- `wwwroot/css/booking.css`
- `wwwroot/js/booking-ui.js`
- `Controllers/BookingController.cs`

## Rules
- Brand name: **Mori International Hotel** (guest/public site)
- Single guest **Book** flow only (`/` / `/Booking`) — no separate Reserve page
- Ahead of min lead time (UI default 24h) ⇒ treated as reservation; within lead time ⇒ booking
- Booking is the public default route (`/` → guest booking)
- Show only available rooms from Room Management
- Hero background image: `/Images/moriyama.jpg` on `.guest-hero` only
- Colors: navy / white / teal only
- Keep flow-specific modals + toasts
- Stay responsive (`clamp`, auto-fit grid, mobile nav)
- UI-only unless asked to persist
- Guest copy should sound public-facing (not admin jargon)

## Change patterns
| Ask | Touch |
|-----|-------|
| Hero / background | `.guest-hero` in `booking.css` + hero markup |
| Room cards | rooms loop in `Index.cshtml` |
| Forms / validation messages | form markup + `booking-ui.js` |
| Nav / logo target | `_CustomerLayout.cshtml` |
| Data source | `BookingController` + `BookingPageViewModel` |

## Verify
Open `/Booking`, resize to mobile, click Reserve/Details, confirm toasts/modals still work.
