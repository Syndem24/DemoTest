# UI/UX Pro Max Anti-Pattern Guard Checklist

## ❌ Anti-Patterns to Avoid

1. **Partial-Width Dark Containers on Light Body**:
   - *Issue*: Placing a dark page or hero card inside a narrow centered container (`max-width: 1200px`) while leaving body background light teal/white on the left and right sides.
   - *Fix*: Apply full-bleed `width: 100%` and `100vw` dark radial gradient body backgrounds (`guest-shell--dark-page`) so the theme spans edge-to-edge across the entire screen.

2. **Low-Contrast Header Links**:
   - *Issue*: Using dark navy text (`#0B1F3A`) on dark navy backgrounds (`#061122`).
   - *Fix*: Enforce crisp white (`#FFFFFF`) or light slate (`#F1F5F9`) for header brand and navigation links over dark heroes or dark shells.

3. **Flat Generic Buttons**:
   - *Issue*: Plain solid blue or unstyled browser standard submit buttons.
   - *Fix*: Use linear gradients from Teal `#0D9488` to `#0F766E`, subtle 1px border, backdrop glow shadows, and smooth 0.25s hover translateY animations.

4. **Missing Responsive Flex/Grid Rules**:
   - *Issue*: Layout breaking or elements overflowing on mobile devices (<640px).
   - *Fix*: Use `clamp()`, flexible CSS Grid/Flexbox, and explicit `@media (max-width: 640px)` fallbacks.
