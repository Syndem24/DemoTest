---
name: ui-ux-design-guardrails
description: Designs and revises polished, accessible, responsive UI/UX using the installed UI/UX Pro Max research skill without generic AI styling. Use when creating or changing layouts, pages, components, forms, modals, navigation, tables, dashboards, booking interfaces, CSS, Razor views, or React UI. Plans and asks permission before changing system flows, persistence, routing, permissions, or API behavior.
---

# UI/UX Design Guardrails

## User requirements

- Eliminates "AI Slop": Stops the AI from picking random colors or messy element hierarchies.
- Built-in Accessibility Checks: Forces the AI to respect text contrast ratios (4.5:1 minimum), focus states, and responsive breakpoints.
- Enforces Interaction Standards: Automatically applies things like cursor-pointer to clickable components and smooth 150-300ms hover transitions.
- Multi-Framework Support: Adapts its code recommendations to React

## Required UI/UX Pro Max integration

For every UI/UX request:

1. Read `.cursor/skills/ui-ux-pro-max/SKILL.md` and follow its research workflow.
2. Check for `design-system/MASTER.md` and a matching file under `design-system/pages/`. Page rules override the master.
3. For a new page, redesign, or new component family, generate the design system before proposing or editing UI:

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<product type> <industry> <style keywords>" --design-system -p "<Project Name>"
```

4. For focused improvements, query the relevant Pro Max domains instead of inventing a new visual direction:

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<accessibility interaction responsive keywords>" --domain ux
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<semantic focus keyboard responsive keywords>" --domain web
```

5. For React work, also retrieve React stack guidance:

```powershell
python .cursor/skills/ui-ux-pro-max/scripts/search.py "<component form layout performance keywords>" --stack react
```

6. Synthesize the research; do not copy recommendations mechanically.

Use this precedence when recommendations conflict:

1. User requirements and approved scope.
2. Project rules and persisted design-system files.
3. Existing product tokens and component patterns.
4. UI/UX Pro Max recommendations.

Never let Pro Max introduce a random palette, framework, dependency, font, or interaction model that conflicts with the current product. Treat its output as researched guidance within the established brand.

## Scope decision

Classify the request before editing:

1. **UI/UX-only change**: layout, spacing, typography, color usage, responsive behavior, visual hierarchy, component presentation, animation, or client-side display state. Inspect existing patterns and implement directly.
2. **System-flow change**: authentication, authorization, routing, database schema, persistence, API contracts, booking lifecycle, payments, destructive actions, or business rules.

For a system-flow change:

1. Explain which behavior would change and why UI work alone is insufficient.
2. Present a concise implementation plan and its user-visible impact.
3. Ask for explicit permission before editing system-flow code.
4. Continue only after approval.

When the request mixes both, complete safe UI-only work only if it remains useful independently. Do not silently introduce backend behavior. Prefer existing data and endpoints.

## Design process

1. Run the required UI/UX Pro Max research.
2. Inspect the current page, shared layout, design tokens, reusable components, and framework conventions.
3. Preserve the product's established brand and component language.
4. Identify the primary task, primary action, supporting information, and exceptional states.
5. Reduce visual noise before adding decoration.
6. Implement the smallest coherent change.
7. Verify accessibility, responsive behavior, interaction states, and consistency.

## Anti-slop rules

- Reuse existing colors, spacing, typography, radii, shadows, icons, and components.
- Never invent a new palette when design tokens already exist.
- Do not default to purple gradients, excessive glass effects, floating cards, giant headings, decorative blobs, or unrelated illustrations.
- Avoid wrapping every section in a card. Use grouping, spacing, dividers, and typography first.
- Keep one obvious primary action per task area. Style secondary and destructive actions distinctly.
- Use a clear heading hierarchy and consistent alignment.
- Prefer concise interface copy that describes the user's task.
- Use real icons from the project's icon system; do not use emoji as interface icons.
- Preserve content density appropriate to the surface: compact for admin/data views, calmer and more expressive for customer-facing pages.

## Accessibility requirements

- Maintain at least 4.5:1 contrast for text and meaningful iconography.
- Use semantic HTML before ARIA. Add ARIA only when native semantics are insufficient.
- Every control must have an accessible name.
- Every keyboard-operable element must have a visible `:focus-visible` state.
- Preserve logical tab order. Never use positive `tabindex`.
- Ensure modals support Escape, focus placement, focus return, and background interaction blocking.
- Do not communicate status using color alone; include text, icons, or patterns.
- Associate validation messages with their fields and provide clear recovery guidance.
- Respect `prefers-reduced-motion`.
- Keep touch targets approximately 44 by 44 CSS pixels where practical.
- Verify zoom and text resizing do not hide content or actions.

## Interaction standards

- Apply `cursor: pointer` to clickable custom controls.
- Use 150–300ms transitions for hover, focus, expansion, and state changes.
- Animate only opacity and transforms when possible.
- Provide hover, focus, active, disabled, loading, empty, error, and success states where relevant.
- Never hide required actions behind hover-only interactions.
- Confirm destructive actions and state their consequence.
- Avoid layout shifts during loading; reserve space or use stable placeholders.
- Keep feedback close to the action that caused it.

## Responsive standards

- Design mobile-first and add breakpoints where content needs them, not for specific devices.
- Prevent horizontal page overflow.
- Use fluid sizing, `clamp()`, flexible grids, wrapping, and sensible max-widths.
- Convert wide data tables into responsive rows, controlled horizontal regions, or alternative compact views.
- Keep primary actions reachable on small screens.
- Test narrow mobile, tablet, laptop, and wide desktop layouts.
- Do not merely shrink desktop UI; reconsider hierarchy and interaction for narrow screens.

## Framework adaptation

Detect and follow the existing framework.

### React

- Reuse existing components and design tokens before creating new abstractions.
- Keep presentational components focused and use state only where interaction requires it.
- Use stable keys, semantic elements, controlled form behavior, and accessible labels.
- Avoid introducing a new UI library unless the user approves the dependency.
- Match the project's styling approach rather than mixing CSS systems.

### Razor or server-rendered HTML

- Reuse shared layouts, partials, tag helpers, existing CSS variables, and unobtrusive patterns.
- Keep progressive enhancement: essential content and actions should remain understandable before JavaScript runs.
- Put surface-specific styling and scripts in the project's established files.

## Verification checklist

- [ ] Existing design tokens and components are reused.
- [ ] UI/UX Pro Max research was consulted and reconciled with project rules.
- [ ] Visual hierarchy has one clear primary task and action.
- [ ] Text and meaningful icons meet 4.5:1 contrast.
- [ ] Keyboard navigation and visible focus states work.
- [ ] Clickable custom controls use the pointer cursor.
- [ ] Hover and state transitions stay within 150–300ms.
- [ ] Loading, empty, error, success, disabled, and destructive states are handled.
- [ ] Mobile, tablet, desktop, zoom, and overflow behavior are checked.
- [ ] Reduced-motion preferences are respected.
- [ ] No system flow changed without an approved plan.

## Handoff

Report:

1. The UI/UX outcome.
2. The primary files or components changed.
3. Where to open and test it.
4. Any system-flow improvement that still requires permission.
