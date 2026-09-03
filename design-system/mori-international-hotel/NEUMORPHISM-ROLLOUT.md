# Neumorphism rollout plan — all Mori surfaces

Ordered phases after Accommodations pilot sign-off.

---

## Customer site (`_CustomerLayout` + `booking.css`)

| Page / view | Route | Phase | Neumo scope | Shell / hook |
|-------------|-------|-------|-------------|--------------|
| **Accommodations** | `/Booking/Accommodations` | **0 — LIVE** | Cards, frame, flow bar, modals | `guest-shell--clay` (washi-clay) ✅ |
| Booking home | `/` `/Booking` | 1 | Featured room cards, about/contact cards | `guest-shell--neumo` on Index |
| Booking modals | (shared) | 2 | Dialog shell, inset fields, spec chips | `.guest-shell--neumo .guest-modal-*` |
| Staff login / OTP | `/Account/*` | 3 | Optional light auth cards only | `guest-shell--auth-neumo` (new) |
| 404 / dark error | `/Home/NotFound` | Skip | Dark page — no neumo | — |

**Hero rule:** Never apply neumorphism to `.guest-hero` photo area.

---

## Admin site (`_Layout` + `site.css` / page CSS)

| Page | Route | Phase | Neumo scope | Hook |
|------|-------|-------|-------------|------|
| Dashboard widgets | `/Dashboard` | **4 — LIVE** | `.dash-widget` cards on linen canvas | `admin-dash-page--neumo` ✅ |
| Bookings | `/AdminBookings` | 4 | Walk-in modals, filter chips — **not** dense tables | Partial |
| Payments | `/AdminPayments` | 4 | Summary bar, flush panels | Partial |
| System audit | `/AdminFlushLogs` | 4 | Filter card, retention `<details>` | Partial |
| Rooms SPA | `/Rooms` | 5 | `rm-app` cards, tabs | `room-app.css` tokens |
| Special offers SPA | `/AdminSpecialOffers` | 5 | Offer group cards | React CSS |
| Admin users SPA | `/AdminUsers` | 5 | User row cards, search field inset | React CSS |
| Account settings | `/Account/Settings` | 4 | Settings hub cards only | Partial |
| Integration / Privacy | `/Home/Privacy` | Skip | Config forms need sharp fields | — |
| Sidebar + top bar | global | Skip | Navy chrome — flat | — |

---

## Engineering checklist per phase

1. Add surface hook class to layout or page wrapper
2. Copy `--neumo-*` tokens (or import shared partial)
3. Map components per MASTER recipes
4. Verify teal primary CTAs unchanged
5. Test focus, contrast, reduced motion
6. Remove conflicting `translateY` hovers on neumo cards

---

## CSS file ownership

| Area | File |
|------|------|
| Customer neumo | `wwwroot/css/booking.css` |
| Admin neumo | `wwwroot/css/site.css` + page-specific flush CSS |
| Room SPA | `ClientApp` → `room-app.css` |
| Design rules | `design-system/mori-international-hotel/MASTER.md` |

---

## Decision log

| Date | Decision |
|------|----------|
| 2026-09-01 | Hybrid neumorphism approved for catalogue surfaces; teal CTAs mandatory |
| 2026-09-02 | Accommodations revised to washi-clay (`guest-shell--clay`) — contemporary Japanese matte, not playful claymorphism |
| 2026-09-01 | Accommodations pilot shipped with `guest-shell--neumo` (superseded by clay) |
| Pending | User sign-off on pilot → Phase 1 booking home |
