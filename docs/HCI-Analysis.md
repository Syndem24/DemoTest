# Mori International Hotel — HCI Analysis of the Live System

Evaluation of the system's pages against two frameworks:

- **HCI Goals**: Safety · Utility · Effectiveness · Efficiency · Usability · Appeal
- **HCI Principles**: Know your user · Understand the task · Reduce memory load ·
  Strive for consistency · Remind users & refresh memory · Prevent errors /
  reversal of action · Naturalness

Each page gets a per-goal and per-principle check tagged
**met** / **partially met** / **not met**, with a one-line justification.

Surfaces covered:

| Page | Route | Users |
|---|---|---|
| Guest homepage | `/` (Booking/Index) | Guests, anonymous visitors |
| Accommodations booking wizard | `/Booking/Accommodations` | Guests |
| Login / registration | `/Account/Login` | Guests, staff |
| Guest portal | `/GuestPortal` | Signed-in guests |
| Admin dashboard | `/Dashboard` | Admin, Receptionist |
| Admin bookings | `/AdminBookings` | Admin, Receptionist |
| Admin payments | `/AdminPayments` | Admin, Receptionist |
| Room management | `/Rooms` | Admin (write), Receptionist (read) |
| Data Management + audit | `/AdminFlushLogs` | Admin only |
| Users, Reviews, Offers, Integration | `/AdminUsers`, `/AdminReviews`, `/AdminSpecialOffers`, `/Home/Privacy` | Mostly admin |

---

## Page 1 — Guest Homepage (`/`)

**Summary:** The public landing page — hero imagery, room browsing, special
offers, reviews, and the entry point into the booking wizard.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Read-only browsing; the only write actions are inside dialogs with validation. |
| Utility | met | Shows rooms, prices, offers, reviews — everything a guest needs to decide. |
| Effectiveness | met | Guests can complete the core task (find a room → book) from this page. |
| Efficiency | partially met | Deep content requires scrolling; room-type jump chips exist but the page is long for returning guests who just want to book. |
| Usability | met | Large tap targets, clear cards, localized text, breadcrumbs into booking. |
| Appeal | met | Designed hero, photography, animated accents — clearly the most polished surface. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Casual visitors: visual browsing, minimal jargon, guest reviews for trust. |
| Understand the task | met | "Book a stay" is the dominant path; CTAs funnel into the wizard. |
| Reduce memory load | met | Prices, occupancy, inclusions shown on cards — nothing to remember between pages. |
| Consistency | met | Navy/teal/white system, shared card and modal patterns across pages. |
| Remind / refresh | partially met | Offer expiry badges remind; but no "you were looking at X dates" recall for returning visitors. |
| Prevent errors / reversal | met | All state-changing actions sit behind the booking wizard's validation, not the landing page. |
| Naturalness | met | Scroll-based browsing matches how hotel sites conventionally work. |

### Gaps
- No "recently viewed dates" or resume-booking prompt — a returning guest starts cold.
- The page is content-heavy; on slow connections the hero + galleries cost real load time.

---

## Page 2 — Accommodations Booking Wizard (`/Booking/Accommodations`)

**Summary:** The core transaction — a two-step wizard (dates/guests → room
selection) inside a drawer, with a live calendar showing nightly rates,
guest-party steppers, special-offer pricing, stay fees, terms consent, and a
success modal on completion.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Server re-validates availability in a serializable transaction; double-submit is disabled client-side and deduplicated server-side; terms must be ticked. |
| Utility | met | Completes the system's primary purpose end-to-end with a booking reference. |
| Effectiveness | met | Step rail ("Step 1 of 2"), per-field errors with `role=alert`, Continue disabled until inputs are valid — the task cannot silently fail. |
| Efficiency | met | Nightly prices on the calendar itself, lowest-rate note, estimated totals on cards — guests don't recheck dates across screens. |
| Usability | met | Full ARIA: `tablist` date tabs, `aria-live` night counter, labelled steppers, `aria-expanded` dialogs, localized strings for every label. |
| Appeal | met | Drawer interaction, animated success modal (ring draw → check stroke → staggered content), consistent design language. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Guests may be non-technical: big date tabs, steppers instead of typed counts, pictures before numbers. |
| Understand the task | met | Linear two-step flow mirrors the mental model: *when → what room → confirm*. |
| Reduce memory load | met | Selected dates stay visible on step 2 with a "Change dates" affordance; estimated totals recalc inline. |
| Consistency | met | Same modal, toast, and button vocabulary as the rest of the guest site. |
| Remind / refresh | met | Booking summary + reference restated in the success modal after redirect. |
| Prevent errors / reversal | met | Invalid dates rejected inline, sold-out types badged "Fully booked" not clickable, terms checkbox gates submit, serializable tx blocks double-booking. |
| Naturalness | met | Calendar picking + drawer flow matches mainstream booking sites (Agoda/Airbnb pattern) — near-zero learning curve. |

### Gaps
- No mid-wizard save: closing the drawer loses selections.
- The wizard is mouse/touch-first; full keyboard-only completion (focus trapping is good, but tab order through the calendar grid is heavy).
- No live chat escalation inside the wizard — chatbot exists but isn't surfaced at the payment-decision moment.

---

## Page 3 — Login / Registration (`/Account/Login`)

**Summary:** Single page for all roles — combined "username or email" + password
field, "Continue with Google" OAuth (which drives guest account creation through
a consent page → password setup), Forgot Password via 6-digit email code.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Identity lockout on failed attempts, generic "invalid login" errors (no account enumeration), OTP codes not links, consent required before guest creation. |
| Utility | met | Covers all three roles plus Google registration and password reset in one place. |
| Effectiveness | met | Role-based redirect after sign-in; staff with `MustChangePassword` get forced to the change screen. |
| Efficiency | met | One combined credential field — no mode switching; Google path is one click. |
| Usability | met | Subtle "New here?" hint under the Google button guides first-time guests without a banner. |
| Appeal | partially met | Clean and on-brand but deliberately minimal — functional, not delightful. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Guests get the Google-first path; staff get the credential path — same page, no wrong turns. |
| Understand the task | met | Sign in is the only task; nothing competes for attention. |
| Reduce memory load | met | "Username or email" removes the "which one did I register with" recall problem. |
| Consistency | met | Shares the guest-auth design system (`.guest-auth-*` classes, OTP digit inputs match). |
| Remind / refresh | met | The guest hint line is exactly a memory refresh for new users. |
| Prevent errors / reversal | met | Lockout, lockout display corrections, `prompt=select_account` prevents silently signing into the wrong Google account, OTP attempt cap (3) + 15-min expiry. |
| Naturalness | met | Standard login layout; Google button placement matches convention. |

### Gaps
- No visible "Forgot password?" support hint about *where* the code arrives (some users expect a link).
- Staff onboarding link (Google verification) lives elsewhere — a locked-out staffer has no self-help path on this page.

---

## Page 4 — Admin Bookings (`/AdminBookings`)

**Summary:** Staff's daily work surface — booking list with search/filters/
pagination, an interactive calendar (clickable days, stay/arrival/checkout
counts, day-detail modal with toggleable stat filters), confirm/reject/edit/
assign-rooms/cancel actions, refund prompts, and realtime SignalR updates.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Antiforgery on all writes, serializable transactions, room assignment blocked unless fully paid, overpaid stays flagged with refund-required messaging. |
| Utility | met | Every booking-lifecycle action lives here — the operational heart for staff. |
| Effectiveness | met | Amber "needs room" attention styling (deliberately not alarming red), late-arrival warnings only for confirmed unassigned bookings 1h+ overdue — attention goes where action is needed. |
| Efficiency | met | Clickable calendar cells, day-modal stats act as filters, pagination keeps the list usable at 700+ bookings (verified under flood data). |
| Usability | partially met | Dense power UI — fine for trained staff, but many modals/filters assume learned knowledge; no inline help or empty-state guidance. |
| Appeal | met | Smooth non-blinking navigation, animated accents, coherent admin design system. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Receptionist workflows prioritized: arrivals needing rooms surface first, payment state shown inline. |
| Understand the task | met | The calendar answers "what's happening today" at a glance; list answers "find this booking". |
| Reduce memory load | met | Day modal aggregates arrivals/stays/checkouts per date — no mental tallying across pages. |
| Consistency | met | Same modal/toast/confirmation vocabulary as payments and rooms pages. |
| Remind / refresh | met | Amber glow on overdue arrivals is a persistent visual reminder; notification bell + SignalR push re-alerts on state changes. |
| Prevent errors / reversal | met | Destructive actions need confirmation; refund requires a ≥8-char reason; fully-paid gate blocks premature room assignment; audit log records every action. |
| Naturalness | partially met | Calendar metaphors are natural, but filter-as-toggle-stats inside a modal is a learned interaction — not discoverable on first use. |

### Gaps
- No onboarding hints/tour for new staff — discoverability relies on exploration.
- "Overpaid — refund needed" state isn't a dedicated badge; it lives in the edit flow and attention glow only.
- No keyboard shortcuts for high-frequency actions (confirm, assign) — power-user efficiency left on the table.

---

## Page 5 — Admin Payments (`/AdminPayments`)

**Summary:** Payment ledger — paged receipt list with method/date/collector
filters, KPI totals (collected/refunded), per-payment detail modal, verify
button for unverified digital receipts, refund (void) with mandatory reason,
and export/flush to PDF.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Append-only ledger — voids, never deletes; reason required; serializable tx on record/refund; server caps payments at balance due. |
| Utility | met | Complete money workflow: record, verify, refund, export — matches the hotel's manual-payment reality. |
| Effectiveness | met | "Needs verify" highlighting on unverified e-wallets draws staff to the one action only they can do. |
| Efficiency | met | Collector filter, date filter, search across receipt/reference/guest — front-desk lookups are fast. |
| Usability | met | Refund modal shows guest + receipt + amount in context before asking for a reason — decision context is right there. |
| Appeal | met | Consistent with bookings page; restrained, professional. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Both admin and receptionist — the same page serves front desk and back office. |
| Understand the task | met | Verify → refund → export is the full task arc; nothing extraneous. |
| Reduce memory load | met | Ledger snapshots (`StayTotalAtPosting`, `BalanceAfter`) mean staff never recompute history. |
| Consistency | met | Shared modal/message patterns; "Refunded" badge consistent with booking statuses. |
| Remind / refresh | met | Unverified-badge + row highlight act as standing reminders of pending verification. |
| Prevent errors / reversal | met | Void keeps the row (full reversal visible); refund button hidden once voided; reason is mandatory — a paper trail for every correction. |
| Naturalness | met | Receipt list reads like a physical receipt book — natural for desk staff. |

### Gaps
- No partial refunds at this surface (full void only) — correct by design, but staff must learn the booking-editor refund path for partials; worth a hint in the modal.
- No bulk verify for a stack of e-wallet receipts — one-at-a-time only.

---

## Page 6 — Room Management (`/Rooms`)

**Summary:** React/Vite SPA inside the admin shell — room-type sections with
jump chips, lazy-mounted grids (for large inventories), add/edit/status/delete
rooms and types, occupancy shown to feed guest availability.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Admin-only writes; delete blocked while bookings reference rooms; NO ACTION FKs mirror the UI rule at the DB level. |
| Utility | met | Full CRUD over types + physical rooms — the inventory the whole system prices against. |
| Effectiveness | met | Status changes propagate to guest availability immediately (catalog notifier). |
| Efficiency | met | Lazy section mounting + type jump chips keep 7+ types × 40+ rooms navigable; pagination removed from grid in favor of bounded DOM — measured under flood. |
| Usability | met | List/grid view toggle; clear status chips. |
| Appeal | met | Consistent admin design despite being a different tech (React) — invisible seam to staff. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Receptionists get read-only view; admins get edit controls — same page, role-shaped UI. |
| Understand the task | met | "Rooms" is the noun; actions map 1:1 to the mental model of a room rack. |
| Reduce memory load | met | Type chips + section anchors keep orientation in a long grid. |
| Consistency | partially met | React SPA inside an MVC app — visually consistent, but interaction timing (SPA mount vs Razor render) differs subtly from other admin pages. |
| Remind / refresh | partially met | Status chips are reminders; no "last changed" context. |
| Prevent errors / reversal | met | Delete guards mirror DB constraints; status vocabulary is constrained (Available/Unavailable/Occupied/Cleaning). |
| Naturalness | met | Grid of door numbers grouped by type — matches the physical room rack. |

### Gaps
- No undo on status flips (must re-set manually).
- Cleaning → Available transitions rely on staff memory; no checklist or timer.

---

## Page 7 — Data Management + Audit (`/AdminFlushLogs`)

**Summary:** Admin-only integrity surface — live audit feed (domain/intent/date
filters, newest-first), pending-change counts, flush logs, and three export
flows (booking history, payments, staff audit) each with export-only vs
export-and-clear.

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Admin-only; export-before-clear ordering enforced; paid bookings and reviewed stays survive clears; 2,000-row cap per flush; everything re-logged into the audit trail. |
| Utility | met | The retention/compliance toolkit — who did what, plus archival exports. |
| Effectiveness | met | Filters (domain, intent, date, search) make 2,000+ audit rows navigable; export warns before clearing. |
| Efficiency | met | Indexed queries (~35ms warm); paged results; summary cards for pending counts. |
| Usability | partially met | Powerful but jargon-heavy ("flush", "intent", "domain") — assumes the admin learned the vocabulary elsewhere. |
| Appeal | partially met | Functional; least polished page by design. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Built for one expert role (AdminManager) — dense data is appropriate here. |
| Understand the task | met | Three clear export paths + audit browsing — matches the retention task. |
| Reduce memory load | met | Flush logs retain what was exported/cleared — no relying on memory of past runs. |
| Consistency | met | Same filter/table/modal vocabulary as other admin pages. |
| Remind / refresh | met | Flush-log expiry (7-day retention) is surfaced in summaries. |
| Prevent errors / reversal | met | Export-before-clear + keep-rules + caps are layered error prevention on the most destructive action in the system. |
| Naturalness | partially met | "Flush" is system-speak; a domain vocabulary a non-technical admin wouldn't guess. |

### Gaps
- Terminology ("flush", "intent", "domain") has no inline glossary.
- No preview of *which* records a clear will remove before confirming.

---

## Page 8 — Supporting Admin Pages (Users, Reviews, Offers, Integration)

**Summary:** Secondary surfaces — staff/guest account management (disable/enable/
delete with self-protection), review moderation (hide/reply/soft-delete),
special-offer CRUD, and the Integration vault (SMTP/Gemini/Groq/Google keys).

### Goals Check

| Goal | Verdict | Why |
|---|---|---|
| Safety | met | Role-gated writes, self-delete/disable blocked, must-disable-before-delete ordering, secrets stored encrypted in `SecureSetting`. |
| Utility | met | Covers the remaining admin tasks end-to-end. |
| Effectiveness | met | Each page completes its task with confirm dialogs and audit logging. |
| Efficiency | partially met | Paged lists + search on users; reviews paginate; offers are a simple table. |
| Usability | partially met | Functional but less guided than bookings/payments — the least-visited pages get the least polish. |
| Appeal | partially met | Consistent but plain. |

### Principles Check

| Principle | Verdict | Why |
|---|---|---|
| Know your user | met | Admin-centric controls, receptionist gets read-only offers and shared review moderation. |
| Understand the task | met | Each page is a single coherent task. |
| Reduce memory load | partially met | User list shows disabled state + date; Integration hides key values — but no "last tested" or status summary on integrations. |
| Consistency | met | Same shells, modals, confirms. |
| Remind / refresh | partially met | Disabled users show their disabled-since date; few other recall aids. |
| Prevent errors / reversal | met | Self-protection, disable-before-delete, SMTP-only test action, hidden credentials — strong guardrails. |
| Naturalness | partially met | Integration page is key-value oriented; a "connections" mental model would be more natural for admins. |

### Gaps
- Integration page shows no health/status per service — admin can't tell if Gemini is down without trying the chatbot.
- Offers list lacks a guest-preview of how the promo renders.

---

# System-Level Analysis

## Coverage balance

**Well-covered goals:** Safety, Utility, Effectiveness. The system is
integrity-first — append-only payments, serializable transactions, role gates,
audit trail — and every page completes its task reliably.

**Partially covered goals:** Efficiency and Usability vary by audience. The
guest side is polished and accessible; the admin side is powerful but assumes
trained users. Appeal is strong on the guest site, functional on admin.

**Well-covered principles:** Consistency (one design system across both
shells), Prevent errors (confirmation, guards, caps everywhere), Reduce memory
load (snapshots, aggregated calendar, visible state), Know your user (clear
guest-vs-staff separation).

**Weakly covered principles:**
- *Remind users / refresh memory* — present on key flows (amber arrivals,
  unverified badges) but thin elsewhere: no resume-booking, no "last changed"
  context, no staff onboarding hints.
- *Naturalness* — mostly strong, but system jargon ("flush", "intent", toggle-
  stats-as-filters) creates learned-vocabulary pockets on the admin side.

## How the pages work together

The narrative splits cleanly at the auth boundary: the **guest shell**
(homepage → wizard → portal) optimizes for appeal + error prevention, while the
**admin shell** (dashboard → bookings → payments → data) optimizes for
integrity + efficiency. The two shells share design vocabulary but never share
a route — the role boundary is itself an HCI safety feature. SignalR pushes
server truth into the UI so staff never act on stale state.

## Structure verdict

Logical: task frequency maps to polish — the booking wizard (highest-stakes,
least-trained users) has the deepest affordances; data management (expert-only)
tolerates jargon. No reorder needed.

## What a complete HCI story still needs

- **Onboarding/discoverability layer** for staff (first-run hints on the
  bookings calendar filters, payment verify, flush flow).
- **Recovery affordances** — undo/status history where actions are reversible
  (room status, offer activation).
- **Jargon glossary** or inline tooltips on the Data Management page.
- **Preview-before-destructive** — show the affected record set before a clear
  or delete executes.

---

# Improvement Suggestions (prioritized)

| # | Suggestion | Principle served | Effort |
|---|---|---|---|
| 1 | Add a small inline hint/tour on the bookings day-modal ("stats are filters — click to filter the list") | Naturalness, Understand the task | Small |
| 2 | Show a preview list (first N references) inside the export-and-clear confirm dialog | Prevent errors | Small |
| 3 | Add a "resume" prompt on the homepage when a guest left an unfinished wizard session | Remind/refresh | Medium |
| 4 | Surface "overpaid — refund needed" as its own badge on booking rows | Remind/refresh, Safety | Small |
| 5 | One-line jargon tooltip on Data Management labels ("flush = export then delete") | Naturalness | Small |
| 6 | Keyboard shortcut (e.g. `A` = assign) on the bookings row for power users | Efficiency | Medium |
| 7 | Show a connectivity/status dot per service on the Integration page | Reduce memory load | Medium |
| 8 | Partial-refund hint inside the payments refund modal ("for partial refunds, use the booking editor") | Understand the task | Small |

*Prepared from a code-level audit of the live system — every "met" is backed by
implementation evidence (ARIA markup, transaction code, role attributes), not
intent statements.*
