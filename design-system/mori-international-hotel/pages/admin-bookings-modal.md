# Admin Bookings Modal — page override

> Overrides `MASTER.md` for reception **booking detail / payment / nested fee** dialogs only.

## Intent

Front-desk operators work a **queue of guests with money and rooms**. The modal is an entity workspace, not a marketing dialog.

Inspired by hotel PMS patterns (Opera Look-to-Book, Cloudbeds reservation presentation, Mateu front-office):

1. **Sticky entity header** — who am I serving (guest + reference) never leaves view
2. **Workflow over screens** — Confirm → Payment → Rooms → Fees → Checkout → Archive stays scannable
3. **One primary next action** in the footer; secondary actions stay quiet
4. **Dense but structured body** — sections with clear titles; fees/payments as supporting panels
5. **Color + label** for status (never color alone)

## Brand (locked)

| Token | Use |
|-------|-----|
| `--navy` `#0b1f3a` | Header text, secondary chrome, borders |
| `--teal` `#1aa6a6` | Primary CTA, current step, progress fill |
| `--white` | Dialog surface |
| Soft navy / teal mixes | Recessed body canvas, pills, hover |

**Do not** introduce Inter, gold CTAs, liquid-glass blur, or purple/cream themes.

## Typography

- Keep admin shell fonts (inherit site / Georgia display accents only where already used)
- Scale: reference `0.72–0.78rem`, guest name `1.1–1.2rem`, section `h3` `0.95rem`, body `0.86rem`
- Guest name truncates with ellipsis; full name on `title`

## Layout

| Zone | Behavior |
|------|----------|
| Header | Sticky; navy-soft strip; reference pill + guest + flow path |
| Body | Scroll; soft navy canvas so white fee/payment cards pop |
| Footer | Sticky; light raised bar; primary teal right-aligned |

## Buttons

| Role | Style |
|------|--------|
| Primary next step | Solid teal + white label + icon |
| Secondary / Adjust | White + navy border |
| Destructive Clear | Rose tint + trash icon |
| Undo Keep | Teal-soft + undo icon |
| Close | Icon button, 44px hit, teal focus ring |

## Accessibility

- `:focus-visible` 2–3px teal ring on all chrome controls
- Backdrop ~0.72–0.78 navy opacity for focus on dialog
- `prefers-reduced-motion: reduce` → no translate / long transitions
- Icon-only controls keep `aria-label`

## Anti-patterns for this page

- Scaling primary buttons on hover (layout shift)
- Hiding the flow path when a step is active
- Multiple equal-weight teal buttons in the footer
- Nested popups without distinct card elevation
