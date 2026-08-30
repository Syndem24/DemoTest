---
name: ui-ux-promax
description: UI/UX Pro Max design intelligence system. Eliminates generic AI aesthetics, enforces 67 UI style rules, 96 industry color palettes with strict support for the project's signature 3-color palette (Navy, Teal, White), guarantees WCAG accessibility, and enforces clean layout anti-pattern guards for web applications.
---

# UI/UX Pro Max Design Intelligence System

The **UI/UX Pro Max** skill bridges functional code and exceptional, state-of-the-art visual design. It eliminates generic "AI aesthetics" and ensures all created or modified user interfaces adhere to real-world, high-end professional design standards.

---

## 1. Core Design System & Palette (3-Color Hotel Signature)

When designing for the **Mori International Hotel** or related hospitality components, strictly align with the brand's signature **Three-Color Palette**:

1. **Luxury Navy (`--navy`)**:
   - **Primary Navy**: `#0B1F3A`
   - **Deep Midnight / Dark Canvas**: `#061122` / `#040D1A`
   - **Line / Border Navy**: `rgba(11, 31, 58, 0.12)`
   - *Role*: Establishes structure, depth, authority, and premium luxury headers/footers/cards.

2. **Vibrant Teal (`--teal`)**:
   - **Primary Teal**: `#1AA6A6`
   - **Emerald / Interactive Teal**: `#0D9488`
   - **Bright Accent Teal**: `#2DD4BF`
   - **Soft Teal Tint**: `rgba(26, 166, 166, 0.08)` / `#E6F7F7`
   - *Role*: Used for call-to-action buttons, key status indicators, interactive hover glows, badges, and focus rings.

3. **Crisp White / Off-White (`--white`)**:
   - **Pure White**: `#FFFFFF`
   - **Soft Canvas White**: `#F4F8FA`
   - **Surface Muted White**: `#FAFDFF`
   - *Role*: Clean layout canvas, readable content backgrounds, crisp text contrast, and spacious content cards.

---

## 2. Typography Intelligence

- **Display / Headings**: `"Cormorant Garamond", Georgia, serif`
  - *Weights*: 600 (Semi-bold), 700 (Bold)
  - *Style*: Elegant, high-contrast serif for titles, 404 hero statements, room titles, and section headers.
- **Body / Interface**: `"Outfit", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  - *Weights*: 400 (Regular), 500 (Medium), 600 (Semi-bold), 700 (Bold)
  - *Style*: Clean, highly legible sans-serif for body text, navigation items, buttons, forms, and badges.

---

## 3. The 4 Principles of UI/UX Pro Max

### A. Eliminate "AI Aesthetics"
- **NO Default Browser Controls**: Custom-style all buttons, selects, inputs, checkboxes, and scrollbars.
- **NO Generic Flat Blue/Red**: Use curated HSL/Hex gradients (e.g. Navy-to-Midnight or Teal-to-Emerald).
- **Glassmorphism & Depth**: Use backdrop filters (`backdrop-filter: blur(16px)`), layered box-shadows, and subtle inner borders (`inset 0 1px 0 rgba(255,255,255,0.15)`).
- **Dynamic Micro-Interactions**: Add subtle hover translations (`transform: translateY(-2px)`), glow transitions (`transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1)`), and dynamic active states.

### B. Automate Brand & Palette Matching
- Match component themes based on page intent:
  - **Full-Bleed Dark Theme** (`guest-shell--dark-page`): Deep Navy background (`#061122`), white header/links, teal accents, and glowing glass cards. Used for error pages, luxury night view showcases, and immersive modal overlays.
  - **Daytime Hero Theme** (`guest-shell--immersive`): Light canvas (`#F4F8FA`), deep navy hero graphics, crisp white cards, teal CTA buttons.
  - **Standard Content Theme**: Clean white/soft-gray container, navy typography, teal primary actions.

### C. Guarantee WCAG Accessibility
- **Contrast Ratio**: Minimum `4.5:1` contrast for standard text and `3.0:1` for large headings/UI components.
- **Dark Mode Nav Legibility**: Ensure top navigation links over dark backgrounds use high-contrast white text (`rgba(241, 245, 249, 0.9)` or `#FFFFFF`), never dark navy on dark navy.
- **Touch Targets**: Minimum `44px x 44px` interactive area on mobile and touch devices.
- **Focus Rings**: Accessible focus outlines using `--teal` (`box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.4)`).

### D. Anti-Pattern Guard
- **NO Partial-Width Floating Boxes**: Full-bleed hero banners and immersive screens MUST span `100vw` or `width: 100%` edge-to-edge across the entire screen viewport. Do not wrap full-bleed layouts inside narrow max-width containers without edge-to-edge body backgrounds.
- **NO Unreadable Text Contrast**: Never place dark navy text on top of dark blue/black backgrounds.
- **NO Abrupt Layout Jumps**: Smooth transitions on hover, focus, open menu, and page state transitions.
- **NO Misaligned Spacing**: Adhere strictly to the 8px spatial grid scale (8px, 16px, 24px, 32px, 48px, 64px).

---

## 4. UI Style Specifications

1. **Buttons & Actions**:
   - Primary: Linear gradient from Teal `#0D9488` to `#0F766e`, white text, border radius `12px`, soft teal glow shadow.
   - Secondary: Semi-transparent backdrop (`rgba(255, 255, 255, 0.08)` or `rgba(11, 31, 58, 0.05)`), refined border, hover elevation.
2. **Cards & Containers**:
   - Subtle border (`1px solid rgba(255,255,255,0.12)` on dark, `1px solid rgba(11,31,58,0.08)` on light).
   - Rounded corners (`border-radius: 16px` to `24px`).
   - Backdrop blur for glass effects (`backdrop-filter: blur(16px)`).
3. **Badges & Pills**:
   - Pill radius (`9999px`), uppercase tracking (`letter-spacing: 0.05em`), live status dot indicator.

---

## 5. Execution Workflow for AI Coding Assistants

When asked to design or update any UI element:
1. **Analyze Environment & Theme Scope**: Determine if the target view is Full-Bleed Edge-to-Edge Dark, Immersive Daytime, or Standard Content.
2. **Apply 3-Color Tokens**: Ensure all elements strictly map to Navy, Teal, or White tokens.
3. **Run Anti-Pattern Check**: Verify background width (`100vw`/`100%`), nav legibility contrast, padding, and responsive scaling.
4. **Deliver Finished Code**: Output clean HTML/CSS/Razor code with no missing layout properties or unstyled edge regions.
