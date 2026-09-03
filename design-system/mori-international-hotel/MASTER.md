# Mori International Hotel — Neumorphism Design System (Master)

> **LOGIC:** For a specific page, check `pages/[page-name].md` first. Page rules override this file.
> **Scope:** Hybrid neumorphism on Mori’s existing navy / white / teal customer + admin surfaces.
> **Pilot:** Accommodations (`guest-shell--clay` washi-clay) — live in `booking.css`.

---

## Brand constraints (do not override)

| Rule | Value |
|------|--------|
| Public colors | `--navy` `#0b1f3a`, `--white`, `--teal` `#1aa6a6` (+ existing soft variants) |
| Customer fonts | Outfit (UI), Cormorant Garamond (display) — **do not** swap to generic rounded fonts |
| Hero | Photo on `.guest-hero` only — not full-page background |
| Primary CTAs | Solid **teal** — never shadow-only neumorphic buttons |
| Admin shell | Navy sidebar (`_Layout`) — neumorphism only on light card surfaces |

---

## Fit verdict (ui-ux-pro-max + WCAG research)

**Use hybrid neumorphism, not pure soft UI.**

| ✅ Good for | ❌ Avoid |
|------------|---------|
| Room cards, amenity panels, catalogue frames | Primary booking / payment submit buttons |
| Recessed guest-count summary chips | Dense forms where fields are indistinguishable |
| Carousel controls, tag chips | Admin navy sidebar / dark auth pages |
| Modal shells on linen backgrounds | Text styled only with shadow depth |

**Accessibility:** Shadow-only boundaries fail WCAG 2.2 SC 1.4.11 (~1.3–1.8:1). Always pair neumorphic surfaces with:
- 1px subtle border `rgba(11, 31, 58, 0.06–0.10)`
- `:focus-visible` **3px teal** outline
- Body text at full navy on surface (≥ 4.5:1)
- State changes: shadow direction **+** border/teal accent

---

## Neumorphism tokens (CSS)

Defined on `.guest-shell--neumo` in `TestingDemo/wwwroot/css/booking.css`:

| Token | Role |
|-------|------|
| `--neumo-surface` | `#f4f8fa` — must match page background |
| `--neumo-light` | White highlight shadow |
| `--neumo-dark` | Navy-tinted shade shadow |
| `--neumo-shadow-soft` | Raised (small) |
| `--neumo-shadow-raised` | Raised (hover / emphasis) |
| `--neumo-shadow-inset` | Recessed panels / chips |
| `--neumo-shadow-pressed` | Active / pressed controls |

**Raised pattern:**
```css
box-shadow:
  10px 10px 22px var(--neumo-dark),
  -10px -10px 22px var(--neumo-light);
```

**Inset pattern:**
```css
box-shadow:
  inset 5px 5px 12px var(--neumo-dark),
  inset -5px -5px 12px var(--neumo-light);
```

**Surface rule:** Element `background` must equal parent canvas (`--neumo-surface`). Illusion breaks on strong gradients or mismatched whites.

---

## Component recipes

### Raised card (room type, dashboard widget)
- `background: var(--neumo-surface)`
- `border: 1px solid rgba(11, 31, 58, 0.06)`
- `border-radius: clamp(14px, 2vw, 18px)`
- `box-shadow: var(--neumo-shadow-soft)`
- Hover: `var(--neumo-shadow-raised)` + teal border tint — **no** `translateY` lift (avoids layout shift)

### Recessed control (guest summary, form field)
- Same background as surface
- `box-shadow: var(--neumo-shadow-inset)`
- Hover/active: `var(--neumo-shadow-pressed)`

### Primary button (always)
- `background: var(--teal)`; `color: var(--white)`
- Drop shadow for depth, **not** dual neumorphic shadows

### Ghost / secondary button (hybrid)
- Neumorphic raised surface + visible border
- Teal border on hover

### Modal dialog (on neumo pages)
- Raised shell on `--neumo-surface`
- Inset inputs inside modal
- Teal primary footer actions

---

## Motion

- Transitions: `200–220ms` on `box-shadow`, `border-color`
- `prefers-reduced-motion: reduce` → instant shadow/border changes
- No scale transforms on large cards (carousel nav: minimal scale OK)

---

## Site-wide rollout matrix

See `NEUMORPHISM-ROLLOUT.md` for per-page class hooks and phase order.

| Phase | Surfaces | Shell hook |
|-------|----------|------------|
| **0 Pilot** | Accommodations catalogue | `guest-shell--clay` (washi-clay matte) |
| **1** | Booking home room previews, contact cards | `guest-shell--neumo` (partial) |
| **2** | Booking modals (guests, offers, book, details) | Scoped under neumo shell |
| **3** | Customer auth (light linen auth only) | `guest-shell--auth-neumo` (proposed) |
| **4** | Admin flush cards (dashboard, payments, audit) | `.admin-flush-card--neumo` |
| **5** | Room Management React SPA | `--neumo-*` in `room-app.css` |
| **Skip** | Hero overlays, navy admin sidebar, error dark page, integration vault forms | — |

---

## Anti-patterns

- ❌ Gold / purple / cream AI themes
- ❌ Neumorphic primary CTAs
- ❌ Shadow-only interactive affordance
- ❌ Emojis as icons
- ❌ `translateY` hover on large neumo cards
- ❌ More than ~15–20 neumorphic elements per viewport

---

## Pre-delivery checklist

- [ ] Surface color matches page background
- [ ] Primary actions solid teal
- [ ] Focus rings visible (`outline: 3px solid var(--teal)`)
- [ ] Text contrast ≥ 4.5:1 on neumo surfaces
- [ ] `cursor-pointer` on interactive neumo controls
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375 / 768 / 1024 / 1440
- [ ] No horizontal overflow
