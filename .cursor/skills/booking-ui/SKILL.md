---
name: booking-ui
description: >-
  Implements UI/UX Pro Max research for the customer hotel booking/reservation UI
  while preserving Mori International Hotel's established Razor design system.
  Use when editing the Booking page, guest hero, booking modals, toasts, available
  rooms display, forms, galleries, terms, or customer layout.
---

# Booking UI with UI/UX Pro Max

## Required design workflow

Before proposing or editing booking UI:

1. Read `.cursor/skills/ui-ux-design-guardrails/SKILL.md`.
2. Read `.cursor/skills/ui-ux-pro-max/SKILL.md`.
3. Analyze the request as a hospitality booking experience:
   - Product: customer hotel booking website
   - Industry: hospitality and travel
   - Style: Japanese-inspired, calm, minimal, trustworthy
   - Stack: ASP.NET Core Razor, semantic HTML, existing CSS and vanilla JavaScript
4. Run the UI/UX Pro Max design-system search:

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "hotel booking hospitality Japanese minimal calm trustworthy" --design-system -p "Mori International Hotel"
```

5. Run focused research matching the requested surface:

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "hotel booking form accessibility validation mobile" --domain ux
python .cursor/skills/ui-ux-pro-max/scripts/search.py "semantic keyboard focus modal responsive booking" --domain web
```

6. Synthesize the results with the existing project. Do not copy generated palettes, fonts, frameworks, or patterns that conflict with Mori's rules.

If `python` is unavailable on Windows, use:

```powershell
& "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe" .cursor/skills/ui-ux-pro-max/scripts/search.py "<query>" <options>
```

Use this precedence:

1. User request and approved scope.
2. Hotel workspace rules and this skill.
3. Existing customer layout, tokens, and components.
4. UI/UX Pro Max recommendations.

## Read first
- `Views/Booking/Index.cshtml`
- `Views/Booking/Accommodations.cshtml`
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
- Do not introduce Tailwind, React, or another UI framework into the Razor customer site
- Maintain at least 4.5:1 text contrast and visible `:focus-visible` states
- Add `cursor: pointer` to custom clickable controls
- Keep hover and state transitions between 150–300ms
- Respect `prefers-reduced-motion`
- Prevent horizontal overflow at 375px, 768px, 1024px, and 1440px widths
- Use SVG icons from the existing visual language, never emoji UI icons

## System-flow boundary

Booking UI changes may use existing controllers, services, DTOs, and endpoints.

Before changing authentication, routing, persistence, database schema, API contracts,
availability rules, booking classification, cancellation behavior, payments, or other
business logic:

1. Explain the required flow change.
2. Present a concise plan and user-visible impact.
3. Ask for explicit permission.
4. Do not edit system-flow code until permission is granted.

## Change patterns
| Ask | Touch |
|-----|-------|
| Hero / background | `.guest-hero` in `booking.css` + hero markup |
| Room cards | room feature loop in `Accommodations.cshtml` |
| Forms / validation messages | form markup + `booking-ui.js` |
| Nav / logo target | `_CustomerLayout.cshtml` |
| Data source | `BookingController` + `BookingPageViewModel` |

## Verify
- Open `/Booking` and `/Booking/Accommodations`.
- Test 375px, 768px, 1024px, and 1440px widths with no page overflow.
- Navigate forms, cards, galleries, and modals using only the keyboard.
- Confirm visible focus, readable contrast, labels, validation, loading, disabled, success, and error states.
- Confirm pointer cursors and 150–300ms interaction transitions.
- Confirm reduced-motion behavior.
- Click Details and Book, exercise date/room selection, terms acceptance, toasts, and modal close behavior.
