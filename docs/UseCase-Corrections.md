# Mori International Hotel — Written Use Case Corrections

Audit of `check_written_use_cases (1).docx` against the implemented system.
Each entry states what the document says, what the system actually does, and why the correction matters.

---

## Corrections that change the meaning (must fix)

### 1. Forgot Password — "reset link" should be "one-time code"

**Document says:** The system sends a password **reset link** to the user's email; the user "opens the link from the email"; the link expires and can only be used once.

**System does:** The system emails a **6-digit one-time code** (`PasswordResetCode` table, hashed at rest). The user returns to the site and types the code on the **VerifyResetOtp** page, which then unlocks the **ResetPassword** form. Nothing clickable is sent — there is no link in the email.

*Source:* `AccountController.cs` — `ForgotPassword` → `VerifyResetOtp` → `ResetPassword` actions (lines 825–972); `Models/PasswordResetCode.cs`.

**Why it matters:** A reviewer or panelist following the document will look for a hyperlink flow that does not exist. More importantly, the two mechanisms have different security properties — an OTP code is typed into the already-open session (no token-bearing URL that can leak via referrer headers or forwarded emails), the code is limited to a small number of attempts (`TooManyAttempts` status), and it expires quickly. Describing it as a "link" misstates the system's actual security design in a document whose purpose is to demonstrate that design.

**Suggested rewrite:** "The system sends a one-time verification code to the user's email through SMTP. The user enters the code on the verification page. If the code is valid, the user sets a new password."

---

### 2. Refund Pay — precondition and inputs are wrong

**Document says:**
- "Refund Pay is only offered for payments that are **already verified**."
- Pre-condition: "The payment **is verified** and has not been refunded yet."
- Inputs: "**Refund Amount**" + "Refund Reason"; "the system checks that the refund amount does not go over the amount paid."

**System does:**
- The Refund action appears for **any posted payment that has not been voided** — including **cash payments (which are never "verified" at all)** and unverified e-wallet receipts. Verification is a gate on digital receipts only, not on refundability.
- The refund modal takes **only a reason (minimum 8 characters)**. There is no amount field — the operation **voids the full payment** (`PaymentRecordStatus.Posted → Voided`), displayed as "Refunded" in the UI. A partial amount cannot be entered.
- The amount-cap check the doc describes (`refund ≤ amount paid`) exists, but in a **different flow**: the booking-editor `RefundAsync` path that posts *negative refund events* against a booking, not the Payments-page refund button.

*Source:* `wwwroot/js/admin-payments.js:375-382` (button visibility), `:442-496` (reason-only modal); `Services/PaymentService.cs` (`VoidAsync` vs `RefundAsync`).

**Why it matters:** This is the document's most consequential error because it inverts a permission rule. As written, it implies cash payments can never be refunded and that refunds are partial-by-default — neither is true. In a thesis defense or QA audit, a tester following the doc would mark the correct behavior ("refund available on a cash receipt") as a bug, or file a defect for the missing amount field that was never intended to exist. The written use case must describe the actual gate — *posted and not yet refunded* — and the actual operation — *full reversal with a mandatory reason*.

**Suggested rewrite:** Pre-condition: "The payment is posted and has not been refunded yet." Inputs: "Selected Payment; Refund Reason (required)." Scenario: "The system voids the full payment amount and marks the payment as Refunded (status Voided). The original record is kept."

---

### 3. Manage API — describes a generic connection manager that doesn't exist

**Document says:** The admin can "add, view, edit, enable or disable, and **remove** the connections to external API services"; on save "the system **tests the connection** with the API Service."

**System does:** The Integration page is a **fixed credential vault** — a hard-coded set of service keys: Gemini key, Groq key, Google OAuth client ID/secret, and SMTP host/credentials. The admin edits keys and toggles whether each built-in service is active. There is no way to add an arbitrary new connection or remove one — the set is fixed by the code. A live connection test exists **only for SMTP** (`TestSmtp`, sends a test email); the other services are validated the next time they are actually used.

*Source:* `Controllers/HomeController.cs` `Privacy` GET/POST + `TestSmtp` (lines 47–216); `ViewModels/IntegrationSettingsViewModel.cs`.

**Why it matters:** The document promises CRUD over an open-ended list of integrations and an automatic connection test on every save. Neither exists. If evaluated against the system, "Add a new API connection" is impossible, and saving a wrong Gemini key silently succeeds (the doc claims the test would catch it). The use case should describe managing the **built-in service keys** and note that connection testing applies to SMTP only.

**Suggested rewrite:** Purpose: "Allows the admin to enter, update, enable, or disable the built-in external service credentials (chatbot AI, Google sign-in, email/SMTP). For SMTP, the admin can send a test email to verify the connection."

---

## Corrections that are imprecise (should fix)

### 4. Login by Email / Login by Username — presented as two selectable modes

**Document says:** "The user chooses to log in by email **or** by username" — as if the page offers a mode selector.

**System does:** There is **one combined field** labeled "Username or email" (`LoginViewModel.UserNameOrEmail`); `FindUserAsync` resolves whichever the user typed. Both use cases are real, but the "selects login by email" step has no UI counterpart.

**Why it matters:** Minor, but the exception scenarios ("if OAuth is not set up, only email and password login" — correct) are the only part that diverges; the phrasing otherwise implies a control that doesn't exist.

**Suggested fix:** "The user enters their username or email address and password" — keep the two use cases but note the shared input field.

---

### 5. Book Room — guests select room types, not rooms

**Document says:** "The guest selects a room."

**System does:** Guests pick **room types with quantities** (`CreateBookingItemRequest`: `RoomTypeId` + `Quantity`) — one booking can hold multiple rooms across types. Physical room assignment is a **staff action** later, and now requires the booking to be fully paid.

**Why it matters:** Understates the system's capability (multi-room, multi-type bookings) and blurs who assigns physical rooms — a real workflow boundary in the system.

---

### 6. Manage Booking — omits the payment gate on room assignment

**Document says:** "updates the booking, such as confirming it, changing its dates or room, or cancelling it" — edits presented as unconstrained.

**System does:** Assigning rooms requires the booking to be **fully paid**; editing a booking cannot lower the total below the amount already paid without recording a refund; an overpaid booking **cannot be archived** until a refund is posted.

**Why it matters:** These are deliberate integrity rules (append-only payment ledger). A reader would reasonably conclude staff can assign rooms to an unpaid booking — the system explicitly blocks this.

---

### 7. Publish Review — inputs understated, edit capability missing

**Document says:** Inputs are "Star Rating" + "Comment"; one review per booking.

**System does:** The form collects **multi-axis ratings** (overall, staff, comfort, facilities), a would-recommend flag, stay tags, and a comment. Guests can also **edit** their review afterward (`PUT /api/guest/reviews/{id}`) — the doc's "one review" rule is correct but should note edits are allowed. A soft-delete (Spam) action also exists for staff and is undocumented.

---

### 8. View Audit Logs — page naming

**Document says:** "The admin opens the **Audit Logs page**."

**System does:** The audit trail is a section of the **Data Management** page (`AdminFlushLogs`), not a standalone page. Filtering (domain, intent, search), newest-first ordering, and admin-only access are all accurate.

---

### 9. Export Data — missing the safety guards

**Document is correct on:** export-only vs export-and-clear, confirmation warning, PDF download, admin-only, audit-recorded.

**Omitted guards worth documenting:** booking history clears **keep bookings that have payment receipts** until the receipts are exported first; a single clear operation is **capped at 2,000 rows** per run. These exist specifically to prevent orphaned financial records and runaway deletes — the kind of constraint a use case document should surface.

---

## Missing use cases (implemented but not documented)

| Flow | Where it lives | Who uses it |
|---|---|---|
| **Record Payment** — staff log cash/arrival payments against a booking | `AdminPaymentsApiController` → `PaymentService.RecordAsync` | Admin, Receptionist |
| **Guest self-service** — view own bookings, account settings, change password | `GuestPortalController` | Guest |
| **Walk-in booking** — receptionist creates bookings for on-site guests | `WalkInController` | Receptionist |
| **Room assignment / check-in / check-out** — plus the background auto-checkout and no-show processing | `AdminBookingsApiController`, `BookingService.Automation` | Admin, Receptionist (+ automated) |
| **Staff Google verification** — staff link their Google identity for sign-in recovery | `GoogleVerificationController` | Admin, Receptionist |

---

## Use cases verified accurate — no changes needed

Register Account · Login Account · Manage Users · Manage Room · View Room ·
View Payment · Verify Payment · Manage Offers · Hide Review · Reply Review ·
Converse Chatbot (rate limit + front-desk fallback confirmed) ·
Export Without Clearing Data · Export and Clear Data
