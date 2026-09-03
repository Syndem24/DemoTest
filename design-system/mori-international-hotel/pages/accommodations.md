# Accommodations — Hallway-Clay (White Atrium)

> Overrides `MASTER.md` for `/Booking/Accommodations`.
> **Status:** Live — white canvas + Mori hallway motifs (nipa palms, black railings).

---

## Design rationale

Inspired by the hotel’s **interior hallway**: bright white walls, **black metal railing grid**, **nipa palms** in planters, warm recessed ceiling glow, polished floor plane.

Full playful claymorphism is out; **white minimal + subtle structure** matches contemporary Japanese / Japandi hospitality.

---

## Background layers (Phase 1 + 2 — live)

| Layer | Treatment |
|-------|-----------|
| White canvas | Shell + cards on `#fff` |
| Railing grid | Repeating gradients on shell |
| Nipa palms | `guest-palm-frond.svg` on page sides |
| Planter pebbles | Dot pattern bottom-center in `.guest-hallway-atrium` |
| Mezzanine rule | Horizontal navy line at `35vh` (desktop) |
| Railing watermark | `guest-hallway-rail.svg` upper-left |
| Door rhythm | Vertical ticks on right margin |
| Hallway photo wash | `Hallway4.jpg` blurred at ~3% opacity |
| Ceiling pulse | Cool white top glow, 14s animation (`prefers-reduced-motion` safe) |

**No warm cream/brown washes** — removed `--hall-glow` and peach gradients that caused side stains.

---

## Background ideas (deferred)

| Idea | Notes |
|------|-------|
| Animated glow variants | Only ceiling pulse shipped |
| Full-bleed hallway photo | Kept ultra-subtle wash only |

---

## Implementation

| Item | Location |
|------|----------|
| Shell class | `_CustomerLayout.cshtml` → `guest-shell--clay` |
| CSS block | `booking.css` — `Accommodations: hallway-clay` |
| Palm art | `wwwroot/Images/guest-palm-frond.svg` |
| Atrium layers | `.guest-hallway-atrium` in `Accommodations.cshtml` |
| Railing art | `wwwroot/Images/guest-hallway-rail.svg` |

---

## Not decorative (by design)

| Element | Reason |
|---------|--------|
| Hero | Real room photography + navy glass — not pattern overlay |
| Primary CTAs | Solid teal |
| Availability badges | High contrast on photos |

