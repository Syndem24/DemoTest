# Mori International Hotel — HotelDb schema

Simple guide to the live SQL Server database (`HotelDb.mdf`).  
Dates are stored in **UTC**. The app shows them in **Philippines time**.

Open this file in Cursor, or open `HotelDb-Schema.docx` in Word.

## How the hotel data fits together

1. **RoomType** = a category you sell (Queen, Twin).  
2. **Room** = one physical door (101, 102) of that type.  
3. **Booking** = one guest stay.  
4. **BookingItem** = how many of each room type are on that stay.  
5. **BookingRoomAssignment** = which door number was given to the guest.  
6. **BookingCharge** = extra fees (early check-in, extra person, snacks).  
7. **PaymentRecord** = money received or voided for that stay.  
8. **SpecialOffer** = a promo price on one room type.  
9. **StaffAccount** + **StaffRole** = who can log in to admin.  
10. **SystemFlushLog** = audit of “export PDF then delete old records.”

```
RoomType ──< Room
    │
    └──< SpecialOffer

Booking ──< BookingItem ──< BookingRoomAssignment >── Room
    │
    ├──< BookingCharge
    └──< PaymentRecord

StaffRole <── StaffAccount ──< StaffAccountLogin
                         └──< StaffAccountToken
StaffAccount ── (ids in) StaffAccountAudit
```

---

## 1. Inventory

### RoomType

**What it is for:** The sellable room category (name, nightly rate, photos, how many guests it holds). Individual door numbers are **not** here; they live in `Room`.

| Attribute | What it is for |
|---|---|
| RoomTypeId | Unique id for this category. |
| Name | Display name, e.g. Queen Room. Must be unique. |
| Description | Longer text shown to guests. |
| CreatedAt | When this type was created (UTC). |
| Inclusions | Amenities list stored as JSON (wifi, breakfast, …). |
| Images | Photo paths stored as JSON. |
| PricePerNight | Standard nightly rate before any promo. |
| MaxOccupancy | How many guests this type can hold. |
| BedCount | How many beds. |

### Room

**What it is for:** One physical guest room (the door number staff assign at check-in).

| Attribute | What it is for |
|---|---|
| Id | Unique id for this door. |
| RoomTypeId | Which category this room belongs to (`RoomType`). |
| RoomNumber | Door number shown to staff, e.g. 101. Must be unique. |
| Status | Housekeeping / occupancy: Available, Unavailable, Occupied, Cleaning (shown as “Maintaining”). |

---

## 2. Guest stays

### Booking

**What it is for:** One guest stay — online book, walk-in, or OTA. This is the main stay record.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| Reference | Public confirmation code guests and staff search by. Unique. |
| GuestName | Guest full name. |
| GuestEmail | Guest email. |
| GuestPhone | Guest phone. |
| CheckInAtUtc | Planned arrival (UTC). |
| CheckoutTimeUtc | Planned departure (UTC). |
| Kind | Booking (near arrival) or Reservation (further ahead). |
| PaymentOption | Full or Half due when they book. |
| Status | Pending, Confirmed, Rejected, Cancelled, CheckedOut. |
| Channel | Where it came from: Online, WalkIn, FrontDeskExtension, Agoda, Expedia, RedDoorz, OtherThirdParty. |
| ArrivalDiscountRequest | Guest may claim Senior or PWD at arrival (None / SeniorCitizen / Pwd). |
| CashOnlyPromo | If true, this stay must be paid in cash (walk-in limited-time promo). |
| SpecialOfferId | Optional promo that was applied (`SpecialOffer`). |
| TotalAmount | Stay total (rooms + fees). |
| AmountDueNow | How much was required at booking time. |
| CreatedAtUtc | When the stay was created. |
| UpdatedAtUtc | Last change. |
| IsArchived | True when moved to admin history (not deleted). |
| ArchivedAtUtc | When it was archived. |
| IsNotificationCleared | Hidden from the admin bell until something new happens. |
| ArrivalWarningSentAtUtc | Set when the “guest arriving soon” warning was shown. |
| PendingCallWarningSentAtUtc | Set when the “call pending guest” warning was shown. |
| CheckoutWarningSentAtUtc | Set when the “checkout soon” warning was shown. |

### BookingItem

**What it is for:** One line on the stay: “2 × Queen at this nightly rate.” Physical room numbers are assigned later.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| BookingId | Which stay this line belongs to. |
| RoomTypeId | Room category. Can be empty if that type was later removed; the name snapshot stays. |
| RoomTypeName | Name copied at booking time so history still makes sense. |
| Quantity | How many rooms of this type. |
| PricePerNight | Nightly rate used for this line (regular or promo). |

### BookingRoomAssignment

**What it is for:** Links a real door (`Room`) to a stay line after reception assigns room numbers. This is **not** inventory.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| BookingItemId | Which stay line this assignment belongs to. |
| RoomId | Which physical room was given to the guest. |

### BookingCharge

**What it is for:** Extra money on the stay besides the nightly room rate.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| BookingId | Which stay. |
| ChargeType | EarlyCheckIn, LateCheckout, ExtraPerson, Incidental, ServiceFee, SnackBeverage, StayExtension. |
| Label | Text shown on the bill. |
| Quantity | Count: rooms, hours, or extra persons. |
| Nights | Multiplier for extra-person fees; usually 1 otherwise. |
| UnitAmount | Price per unit. |
| Amount | Line total. |
| CreatedAtUtc | When the fee was added. |

---

## 3. Money

### PaymentRecord

**What it is for:** Company log of money posted against a stay. Rows are not edited; a bad payment is **voided**.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| BookingId | Which stay this payment belongs to. |
| ReceiptNumber | Unique receipt code. |
| EventType | Deposit, ArrivalPayment, BalanceSettlement, Refund, Adjustment. |
| Method | Cash, EWallet, BankTransfer, or legacy Card / Maya / Other. |
| Amount | Money amount. |
| StayTotalAtPosting | Stay total at the moment this was posted. |
| BalanceAfter | Remaining balance after this row. |
| PaidAtUtc | When it was posted. |
| ReceivedBy | Staff name who recorded it. |
| Notes | Optional comment. |
| Status | Posted or Voided. |
| ExternalReference | E-wallet / InstaPay reference from the guest receipt. |
| BankTransferReference | Bank / InstaPay clearing reference. |
| ReceiptImagePath | Saved photo of a digital receipt. |
| VoidedAtUtc | When it was voided (if ever). |
| VoidReason | Why it was voided. |
| VoidedBy | Who voided it. |

---

## 4. Promos

### SpecialOffer

**What it is for:** A promo rate for **one** room type. The same campaign title can appear on several room types as sibling rows.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| RoomTypeId | Which room type this promo applies to. |
| Kind | LimitedTime or StayLongerSaveMore (older kinds exist but are not created anymore). |
| Title | Campaign name. |
| Description | Optional details. |
| RegularPricePerNight | “Was” / comparison price. |
| PromoPricePerNight | Promo nightly rate. |
| MinNights | Minimum nights for Stay Longer; empty for Limited Time. |
| Channels | Bit flags for where it shows: Online, Walk-in, Front desk, third-party (visibility only). |
| CashOnly | If true, the stay must be paid in cash. |
| IsActive | Whether staff still treat it as on. |
| StartsAtUtc | Promo start. |
| EndsAtUtc | Promo end. |
| SortOrder | Display order. |
| CreatedAtUtc | Created. |
| UpdatedAtUtc | Last edit. |

---

## 5. Staff login

Staff log in with **StaffAccount**. Job title is **StaffRole**, stored as `StaffAccount.RoleId` (one role per person).  
Google sign-in extras are **StaffAccountLogin** and **StaffAccountToken**.  
Who changed an account is **StaffAccountAudit**.

### StaffRole

**What it is for:** Job titles used by admin security. Typical names: `AdminManager`, `Receptionist` (and a reserved `Guest` name).

| Attribute | What it is for |
|---|---|
| Id | Unique id (text). |
| Name | Role name shown in the app. |
| NormalizedName | Uppercase copy used for lookups. |
| ConcurrencyStamp | Stops two people overwriting the role at the same time. |

### StaffAccount

**What it is for:** One staff login (username, password, profile). This is the real user table.

| Attribute | What it is for |
|---|---|
| Id | Unique id (text). |
| UserName | Login name. |
| NormalizedUserName | Uppercase copy for lookups. |
| Email | Work email. |
| NormalizedEmail | Uppercase copy for lookups. |
| EmailConfirmed | Whether email was confirmed. |
| PasswordHash | Encrypted password (never plain text). |
| SecurityStamp | Invalidates old cookies when the account changes. |
| ConcurrencyStamp | Stops two edits colliding. |
| PhoneNumber | Staff phone. |
| PhoneNumberConfirmed | Whether phone was confirmed. |
| TwoFactorEnabled | Reserved for 2FA. |
| LockoutEnd | If set in the future, the account is locked until then. |
| LockoutEnabled | Whether lockout is allowed. |
| AccessFailedCount | Failed login attempts. |
| FullName | Display name in admin. |
| BirthDate | Date of birth. |
| Address | Address. |
| MustChangePassword | Force password change on next login (temp password). |
| GoogleEmail | Gmail used for verify / future 2FA. |
| NormalizedGoogleEmail | Uppercase Gmail for unique lookup. |
| GoogleVerificationStatus | NotLinked, PendingGoogleVerification, or GoogleVerified. |
| RoleId | Which `StaffRole` this person has (AdminManager or Receptionist). |

### StaffAccountLogin

**What it is for:** External login link (Google). One row per provider key.

| Attribute | What it is for |
|---|---|
| LoginProvider | Provider name, e.g. Google. |
| ProviderKey | Id from that provider. |
| ProviderDisplayName | Label for the provider. |
| UserId | Which `StaffAccount` this belongs to. |

### StaffAccountToken

**What it is for:** Auth tokens for a staff account (verify email, 2FA, recovery).

| Attribute | What it is for |
|---|---|
| UserId | Which staff account. |
| LoginProvider | Token group / provider. |
| Name | Token name. |
| Value | Token value. |

### StaffAccountAudit

**What it is for:** Who created, edited, or disabled a staff account. Can be flushed from Flush logs.

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| Action | What happened (create, edit, disable, …). |
| TargetUserId | The staff account that was changed. |
| PerformedByUserId | The staff account that did the change. |
| RoleAssigned | Role at the time of the action. |
| AtUtc | When it happened. |

---

## 6. Records / flush

### SystemFlushLog

**What it is for:** After staff export history or payments to PDF (or flush staff audit) and delete those rows, this table remembers who did it. Entries are kept about **7 days** (expiry is calculated in code, not stored as a column).

| Attribute | What it is for |
|---|---|
| Id | Unique id. |
| Kind | BookingHistory, Payments, or StaffAudit. |
| FlushedAtUtc | When the flush ran. |
| PerformedBy | Staff name typed for the flush. |
| RecordCount | How many rows were exported / deleted. |
| FileName | PDF (or zip) file name if one was downloaded. |
| Summary | Short description of what was flushed. |

---

## 7. EF helper table

### __EFMigrationsHistory

**What it is for:** Entity Framework’s list of schema updates already applied. Not hotel data. Do not edit by hand.

---

## Tables that were removed on purpose

These used to exist. They are **not** in HotelDb now:

| Old table | Why it went away |
|---|---|
| StaffUser | Unused leftover from before Identity login. |
| StaffAccountRole | Role was merged onto `StaffAccount.RoleId`. |
| StaffAccountClaim | Empty; not used. |
| StaffRoleClaim | Empty; not used. |

---

## Code map (where to look)

| Table | C# type | Configured in |
|---|---|---|
| RoomType | `RoomType` | `HotelBookingDbContext` |
| Room | `Room` | same |
| Booking | `Booking` | same |
| BookingItem | `BookingItem` | same |
| BookingRoomAssignment | `BookingRoomAssignment` | same |
| BookingCharge | `BookingCharge` | same |
| PaymentRecord | `PaymentRecord` | same |
| SpecialOffer | `SpecialOffer` | same |
| StaffAccount | `ApplicationUser` | same |
| StaffRole | `IdentityRole` | same |
| StaffAccountLogin | Identity login | same |
| StaffAccountToken | Identity token | same |
| StaffAccountAudit | `StaffAccountAudit` | same |
| SystemFlushLog | `SystemFlushLog` | same |

Models live under `TestingDemo/Models/`.
