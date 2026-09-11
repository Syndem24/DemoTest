# Mori International Hotel — QA test checklist

**Product:** Mori International Hotel booking system  
**Stack:** Guest Razor site + Admin MVC/React Rooms SPA · .NET 9 · SQL Server LocalDB  
**Environments:** Local `http://localhost:5288` (run via `.\run.ps1` or F5; leave process running)  
**Build:** Confirm `/health` returns Healthy before testing  

**Roles to use**
| Role | Typical login | Access |
|------|---------------|--------|
| Guest (anonymous) | none | Book, browse, chat, public reviews |
| Guest (Google) | Google guest | Reviews for own stays, settings, loyalty |
| Receptionist | staff account | Bookings, walk-in, payments, rooms (limited) |
| AdminManager | admin.manager / staff | Full admin, offers, staff, audit, flush |

Mark each item: **Pass** / **Fail** / **Blocked** · note build/date in the header when you start.

---

## 0. Smoke (must pass first)

| # | Check | Result | Notes |
|---|--------|--------|-------|
| S1 | App starts without FATAL; console shows “Mori International Hotel is running” | | |
| S2 | `GET /health` → Healthy | | |
| S3 | Guest home `/` loads (not ERR_CONNECTION_REFUSED) | | |
| S4 | Staff `/Account/Login` loads | | |
| S5 | Second app instance fails or is blocked when single-instance is on | | |

---

## 1. Guest site — browse & book

| # | Check | Result | Notes |
|---|--------|--------|-------|
| G1 | Hero / brand shows **Mori International Hotel**; navy/teal/white only | | |
| G2 | Room types show only when physical rooms are **Available** | | |
| G3 | Room type name, inclusions, photos, price, occupancy display | | |
| G4 | Change check-in/out → availability / sold-out labels update | | |
| G5 | Night count matches dates (checkout exclusive) | | |
| G6 | Cart: add/remove room types; quantity respects remaining inventory | | |
| G7 | Guests: adults/children; extra-person fee note when > included (2/room) | | |
| G8 | Early check-in / late checkout fees (if offered) update total | | |
| G9 | Special offer / promo applies when eligible; total updates | | |
| G10 | Book submit creates booking; success shows **reference** | | |
| G11 | Invalid dates / sold-out → clear error (no silent fail) | | |
| G12 | Rapid re-submit → rate limit or single booking (no duplicates) | | |
| G13 | Accommodations wizard: full flow to book | | |
| G14 | Far check-in soft warning appears; can continue or change date | | |
| G15 | Terms / Privacy pages load and switch language with i18n | | |

### Cookies & drafts

| # | Check | Result | Notes |
|---|--------|--------|-------|
| C1 | Cookie banner: **Accept all** vs **Necessary only** | | |
| C2 | Necessary only → stay drafts not saved / cleared | | |
| C3 | Accept all → wizard/book draft can restore after refresh | | |
| C4 | Footer Cookies link re-opens preference | | |

### Language

| # | Check | Result | Notes |
|---|--------|--------|-------|
| L1 | Switch en / ja / ko / ru / zh-Hans — nav + key booking strings | | |
| L2 | Room inclusions/names translate or fall back cleanly | | |

### Chat

| # | Check | Result | Notes |
|---|--------|--------|-------|
| H1 | Chat opens; welcome message | | |
| H2 | FAQ-style question gets useful reply | | |
| H3 | Spam messages → rate limit (no crash) | | |
| H4 | Chat disabled in config → widget hidden/safe | | |

### Guest account & reviews

| # | Check | Result | Notes |
|---|--------|--------|-------|
| R1 | Google guest sign-in (if configured) | | |
| R2 | Account settings page loads when signed in | | |
| R3 | Public reviews list shows published reviews only | | |
| R4 | After **CheckedOut** stay matching email: Write/Edit review | | |
| R5 | Cannot review someone else’s booking (403 / blocked) | | |
| R6 | Review ratings + comment save; appear when published | | |

---

## 2. Admin — auth & shell

| # | Check | Result | Notes |
|---|--------|--------|-------|
| A1 | Login success → Dashboard or Rooms | | |
| A2 | Wrong password → error; lockout after repeated failures | | |
| A3 | Logout clears access to admin URLs | | |
| A4 | MustChangePassword forces change before other pages | | |
| A5 | Forgot password OTP (if SMTP set) — request + reset | | |
| A6 | Receptionist cannot open AdminManager-only pages (staff/audit/flush) | | |
| A7 | Sidebar: Home, Guest, Rooms, Privacy (and module links) work | | |
| A8 | Mobile/narrow: sidebar usable; no broken layout | | |

---

## 3. Room management (`/Rooms`)

| # | Check | Result | Notes |
|---|--------|--------|-------|
| RM1 | SPA loads room types + door numbers | | |
| RM2 | Create room type (name, price, occupancy, beds, inclusions, photos) | | |
| RM3 | Edit room type; guest site reflects changes after refresh | | |
| RM4 | Create physical rooms with **unique** room numbers | | |
| RM5 | Duplicate room number rejected | | |
| RM6 | Set room Unavailable → disappears from guest Available inventory | | |
| RM7 | Set Available again → returns to guest catalog | | |
| RM8 | Delete room/type blocked or safe when in use | | |

---

## 4. Admin bookings

| # | Check | Result | Notes |
|---|--------|--------|-------|
| B1 | Bookings list loads; filters (status/date) work | | |
| B2 | Open detail: guest, dates, items, charges, payments | | |
| B3 | Online Pending → Confirm | | |
| B4 | Reject / Cancel releases inventory (dates free again) | | |
| B5 | Assign physical rooms; Occupied status updates | | |
| B6 | Cannot double-assign same room overlapping stay | | |
| B7 | Early / late / extra-person / incidental charges; total recalculates | | |
| B8 | Extra person: per-room selection saves correctly | | |
| B9 | Checkout → CheckedOut; rooms released | | |
| B10 | Walk-in create (guest, dates, rooms, fees) succeeds | | |
| B11 | Reservation calendar shows stays | | |
| B12 | Notification bell: new booking; mark read | | |
| B13 | SignalR: second admin tab updates without full reload (if feasible) | | |
| B14 | Flush history (AdminManager only) — confirm + log | | |

---

## 5. Payments

| # | Check | Result | Notes |
|---|--------|--------|-------|
| P1 | Post **Cash** payment; receipt number; balance updates | | |
| P2 | Post **E-wallet** with reference | | |
| P3 | Upload/capture receipt image; OCR or parse fills ref/amount (or manual) | | |
| P4 | Void payment with reason; status Voided | | |
| P5 | Payments list filter by day / collector | | |
| P6 | No credit-card PAN fields required | | |

---

## 6. Special offers

| # | Check | Result | Notes |
|---|--------|--------|-------|
| O1 | Create Limited Time / Stay Longer / Loyalty (AdminManager) | | |
| O2 | Edit offer | | |
| O3 | Deactivate / reactivate (with dates) succeeds | | |
| O4 | Delete offer; old bookings keep history | | |
| O5 | Guest online sees OnlineVisible offers only | | |
| O6 | Walk-in sees walk-in offers | | |
| O7 | Cash-only offer enforces cash path where applicable | | |
| O8 | CSRF: deactivate without token fails (advanced) | | |

---

## 7. Staff admin (AdminManager)

| # | Check | Result | Notes |
|---|--------|--------|-------|
| ST1 | Create Receptionist; email/temp password path | | |
| ST2 | Edit staff profile/role | | |
| ST3 | New staff must change password on first login | | |
| ST4 | Audit log shows admin actions | | |
| ST5 | Dashboard widgets load | | |

---

## 8. Automation & ops

| # | Check | Result | Notes |
|---|--------|--------|-------|
| X1 | Arrival / pending-call / checkout warnings surface near window (or logs) | | |
| X2 | Auto-checkout / auto-cancel pending (if test data + wait) | | |
| X3 | `/health/ready` unhealthy when DB stopped (optional negative) | | |
| X4 | Backup DryRun: `.\scripts\backup-restore-database.ps1 -Action DryRun` | | |

---

## 9. Security & abuse (light)

| # | Check | Result | Notes |
|---|--------|--------|-------|
| SEC1 | Guest cannot call admin APIs (401/403) | | |
| SEC2 | Antiforgery: forged admin POST without token fails | | |
| SEC3 | XSS: room description with `<script>` shows escaped, not executed | | |
| SEC4 | Production-like: `AllowBootstrapSeed` false does not create admin | | |

---

## 10. Regression after deploy blockers

| # | Check | Result | Notes |
|---|--------|--------|-------|
| D1 | Dev uses real HotelDb data (rooms/bookings visible) | | |
| D2 | No temp admin password printed in console logs | | |
| D3 | Browser opens or manual `/` works after `.\run.ps1` | | |

---

## Sign-off

| | |
|--|--|
| Tester | |
| Build / commit | |
| Date | |
| Environment | |
| Overall | Pass / Fail / Pass with defects |
| Blocking defects | |
| Non-blocking defects | |
