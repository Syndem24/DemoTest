# Accommodations — Booking Wizard

> Overrides `MASTER.md` for `/Booking/Accommodations`.
> **Status:** Live — dark navy hero + two-step stay wizard (dates + guests → rooms) with a right-side booking drawer.

---

## Design rationale

Guest booking follows the Hotel Landing Page prototype: **Outfit + Cormorant Garamond**, navy `#0B1F3A` / teal `#1AA6A6` / canvas `#F4F8FA`. Hallway-clay palms and atrium layers are **not** used on this page so the wizard reads as one full-width flow.

One Book path only (`/Booking/Accommodations`). No second Reserve route.

---

## Layout

| Band | Treatment |
|------|-----------|
| Hero | Full-bleed navy with `/Images/moriyama.jpg` wash (not a page-wide background) |
| Wizard | Max 75rem inner; Stay Dates opens the guest modal first, then a single-month calendar. Guests tab catches (zoom + teal flash) after **Done**. Calendar prices are the lowest nightly room rate. Footer is compact with **Clear dates**. Continue after dates without guests reopens the modal: “Fill this first before proceeding.” Then Choose Room. Header **Rooms** and **Book a stay** both open `/Booking/Accommodations` (calendar first). |
| Rooms | 2-column cards → 1 column below 900px |
| Cart | Nav **My Booking** + teal badge on this page only |
| Drawer | Right sheet (~500px) summary → guest form → **review** (breakdown, Senior/PWD, cancellation, terms) → confirmation with API reference |
| Details / offer sheets | Shared large sheet; bento photo grid on both (hero + tiles, `object-fit: cover`); amenities open by default. Offers fill the sheet by count: 1 wide split card, 2 side-by-side, 3 across on large screens |
| Add to Booking | Offer **Add** is solid teal (navy when added). If Stay longer is the only rate offer and nights are below the minimum, the modal also shows a **standard rate** card so the guest can add the room for the dates already chosen; stay-longer still opens a date-adjust dialog. Room details stays in the offer footer |
| Loyalty | No corner popup ad. **Sign up and pay** sits on each offer rate and above the My Booking / review total; Google sign-in still applies the coupon |
| Policy | Wi-Fi, peso rates, 2:00 PM / 12:00 NN, Terms of Stay — no breakfast-included claim |
| Return after Google | Stay draft in `sessionStorage` (`mori.wizStayDraft`) restores dates, guests, room picks, and Choose Room. Cookie bar is site-wide on `_CustomerLayout`. |

---

## Implementation

| Item | Location |
|------|----------|
| Shell class | `_CustomerLayout.cshtml` → `guest-shell--wiz` |
| CSS | `wwwroot/css/accommodation-wizard.css` |
| JS | `wwwroot/js/accommodation-wizard.js` |
| Markup | `Views/Booking/Accommodations.cshtml` |
| Submit | Existing `POST /api/bookings` |

---

## HCI

- Visible labels, required `*`, `role="alert"` field errors
- `:focus-visible` 3px teal ring; `cursor: pointer` on controls
- 150–300ms transitions; `prefers-reduced-motion` disables travel
- Adding a room type or selecting an offer: toast confirmation, then a fly-to-cart chip into **My Booking**; the cart icon shakes and flashes teal. `prefers-reduced-motion` skips travel and only pulses the cart.
- When every room is selected, **Review & Book** lifts slightly and emits a single teal wave line. `prefers-reduced-motion` keeps the button still.
- Sticky summary + drawer usable from 375px up; no horizontal overflow
- Choose Room **Change dates** is a teal pill button beside the stay chips. Completed **Stay Dates** in the step bar is also a back control.
- Guests sit in the stay header beside Check-in. The occupancy modal opens on arrival. Soft teal highlight until confirmed; **Done** zooms and flashes the Guests tab teal. Child age is required (`*`). **Continue** after dates without confirming guests opens the modal with “Fill this first before proceeding.”
- Calendar shows one month. Amounts under each date are the lowest nightly room rate; offers may be lower. After check-out is chosen, a teal **N nights** pill sits in the calendar footer between the price note and Clear dates. **Clear dates** resets the range.
- Signing in with Google from Choose Room returns to Choose Room with the same dates and rooms (stay draft). Cookie banner: **Necessary only** and **Accept all** are equal; necessary storage is not blocked.
