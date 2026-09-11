# Mori International Hotel — HotelDb schema

Guide to the live SQL Server database used by TestingDemo (`HotelBookingDbContext`).  
Dates are stored in **UTC**. The app displays them in **Philippines time**.

Open this file in Cursor, or regenerate `HotelDb-Schema.docx` with:

```powershell
python docs/generate-hoteldb-schema-doc.py
```

---

## Entity type legend (ER)

| Type | Meaning in this schema |
|---|---|
| **Strong** | Has its own primary key; can exist without depending on another hotel entity’s identity. |
| **Weak / dependent** | Has a surrogate key, but lifecycle is owned by a parent (usually cascade delete). |
| **Associative** | Bridge / junction resolving a many-to-many (or assignment) between two entities. |
| **Identity satellite** | ASP.NET Identity support tables keyed by user + provider (composite). |

---

## Master list — entity type, key, relationships

| Table | C# type | ER type | Primary key | Relationships |
|---|---|---|---|---|
| **RoomType** | `RoomType` | Strong | `RoomTypeId` | 1 → N `Room`; 1 → N `SpecialOffer`; referenced by `BookingItem` (optional) |
| **Room** | `Room` | Strong | `Id` | N → 1 `RoomType`; referenced by `BookingRoomAssignment` |
| **Booking** | `Booking` | Strong | `Id` | optional N → 1 `SpecialOffer`; 1 → N `BookingItem`, `BookingCharge`, `PaymentRecord`; 1 → 0..1 `StayReview` |
| **BookingItem** | `BookingItem` | Weak / dependent | `Id` | N → 1 `Booking` (cascade); optional N → 1 `RoomType`; 1 → N `BookingRoomAssignment` |
| **BookingRoomAssignment** | `BookingRoomAssignment` | **Associative** | `Id` | N → 1 `BookingItem` (cascade); N → 1 `Room` (restrict); unique `(BookingItemId, RoomId)` |
| **BookingCharge** | `BookingCharge` | Weak / dependent | `Id` | N → 1 `Booking` (cascade) |
| **PaymentRecord** | `PaymentRecord` | Weak / dependent | `Id` | N → 1 `Booking` (cascade); unique `ReceiptNumber` |
| **SpecialOffer** | `SpecialOffer` | Strong | `Id` | N → 1 `RoomType` (cascade); optionally referenced by `Booking` |
| **StayReview** | `StayReview` | Weak / dependent | `Id` | N → 1 `Booking` (cascade); unique `BookingId` (one review per stay) |
| **StaffRole** | `IdentityRole` | Strong | `Id` (string) | 1 → N `StaffUser` via `RoleId` |
| **StaffUser** | `ApplicationUser` | Strong | `Id` (string) | N → 1 `StaffRole`; 1 → N logins/tokens/reset codes |
| **StaffExternalLogin** | Identity login | Identity satellite | `(LoginProvider, ProviderKey)` | N → 1 `StaffUser` |
| **StaffAuthToken** | Identity token | Identity satellite | `(UserId, LoginProvider, Name)` | N → 1 `StaffUser` |
| **StaffPasswordResetCode** | `StaffPasswordResetCode` | Weak / dependent | `Id` | logically N → 1 `StaffUser` (`UserId`) |
| **SecureSetting** | `SecureSetting` | Strong | `Id` | none (vault rows keyed by unique `Key`) |
| **SystemAuditLog** | `SystemAuditLog` | Strong | `Id` | none (append-only; actor ids are strings) |
| **SystemFlushLog** | `SystemFlushLog` | Strong | `Id` | none (export metadata; ~7-day retention in app) |
| **__EFMigrationsHistory** | EF internal | Strong (tooling) | `MigrationId` | none |

---

## Relationship diagram

```
RoomType ──< Room
    │
    ├──< SpecialOffer
    │         ↑ (optional)
    │         │
Booking ──────┘
    │
    ├──< BookingItem >── RoomType (optional)
    │         │
    │         └──< BookingRoomAssignment >── Room     ← associative
    │
    ├──< BookingCharge
    ├──< PaymentRecord
    └──< StayReview (0..1)

StaffRole <── StaffUser ──< StaffExternalLogin
                    │    └──< StaffAuthToken
                    └──< StaffPasswordResetCode

SecureSetting          (standalone vault)
SystemAuditLog         (standalone append-only)
SystemFlushLog         (standalone export log)
```

Cardinality notes:

- **RoomType → Room**: one-to-many (restrict delete on type if rooms exist).  
- **BookingItem ↔ Room**: many-to-many via **BookingRoomAssignment**.  
- **Booking → StayReview**: one-to-zero-or-one.  
- **StaffUser → StaffRole**: many-to-one (`RoleId`, set-null on role delete).

---

## 1. Inventory

### RoomType — **Strong**

**Purpose:** Sellable room category (Queen, Twin, …). Door numbers are **not** here.

| Attribute | Type / notes | Meaning |
|---|---|---|
| RoomTypeId | PK, int | Unique id. |
| Name | string, unique | Display name. |
| Description | string? | Guest-facing description. |
| CreatedAt | DateTime UTC | Created. |
| Inclusions | JSON list | Amenities (wifi, breakfast, …). |
| Images | JSON list | Photo paths. |
| PricePerNight | decimal(18,2) | Standard nightly rate. |
| MaxOccupancy | int | Max guests. |
| BedCount | int | Beds. |

**Relationships:** 1→N `Room`, 1→N `SpecialOffer`; optional parent of `BookingItem.RoomTypeId`.

### Room — **Strong**

**Purpose:** One physical guest room (door number).

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| RoomTypeId | FK → RoomType | Category. |
| RoomNumber | string, unique | Door number (e.g. 101). |
| Status | enum string | Available, Unavailable, Occupied, Cleaning (UI: Maintaining). |

**Relationships:** N→1 `RoomType`; referenced by `BookingRoomAssignment`.

---

## 2. Guest stays

### Booking — **Strong**

**Purpose:** One guest stay (online, walk-in, or OTA).

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| Reference | string, unique | Public confirmation code. |
| GuestName | string | Guest name. |
| GuestEmail | string | Guest email. |
| GuestPhone | string | Guest phone. |
| CheckInAtUtc | DateTime | Planned arrival (UTC). |
| CheckoutTimeUtc | DateTime | Planned departure (UTC). |
| Kind | enum | Booking or Reservation. |
| PaymentOption | enum | Full or Half due at book. |
| Status | enum | Pending, Confirmed, Rejected, Cancelled, CheckedOut. |
| Channel | enum | Online, WalkIn, FrontDeskExtension, Agoda, Expedia, RedDoorz, OtherThirdParty. |
| ArrivalDiscountRequest | enum | None, SeniorCitizen, Pwd. |
| CashOnlyPromo | bool | Cash-only stay. |
| SpecialOfferId | FK? → SpecialOffer | Optional promo applied. |
| TotalAmount | decimal | Stay total. |
| AmountDueNow | decimal | Amount due at booking. |
| AdultCount | int | Adults. |
| ChildCount | int | Children under 12. |
| GuestPartyJson | string? | Per-room headcounts JSON. |
| CreatedAtUtc | DateTime | Created. |
| UpdatedAtUtc | DateTime | Last change. |
| IsArchived | bool | In history (not deleted). |
| ArchivedAtUtc | DateTime? | When archived. |
| IsNotificationCleared | bool | Hidden from admin bell. |
| ArrivalWarningSentAtUtc | DateTime? | Arrival warning stamped. |
| PendingCallWarningSentAtUtc | DateTime? | Pending-call warning stamped. |
| CheckoutWarningSentAtUtc | DateTime? | Checkout warning stamped. |

**Relationships:** optional N→1 `SpecialOffer`; 1→N `BookingItem`, `BookingCharge`, `PaymentRecord`; 1→0..1 `StayReview`.

### BookingItem — **Weak / dependent**

**Purpose:** Room-type line on a stay (qty × nightly rate).

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| BookingId | FK → Booking (cascade) | Parent stay. |
| RoomTypeId | FK? → RoomType | Category (nullable if type removed). |
| RoomTypeName | string | Name snapshot at book time. |
| Quantity | int | Rooms of this type. |
| PricePerNight | decimal | Line nightly rate. |

**Unique:** `(BookingId, RoomTypeId)`.  
**Relationships:** N→1 `Booking`; optional N→1 `RoomType`; 1→N `BookingRoomAssignment`.

### BookingRoomAssignment — **Associative**

**Purpose:** Assigns a physical `Room` to a `BookingItem` line.

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| BookingItemId | FK → BookingItem (cascade) | Stay line. |
| RoomId | FK → Room (restrict) | Physical room. |

**Unique:** `(BookingItemId, RoomId)`.  
**Relationships:** bridges `BookingItem` ↔ `Room`.

### BookingCharge — **Weak / dependent**

**Purpose:** Extra fees on a stay.

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| BookingId | FK → Booking (cascade) | Parent stay. |
| ChargeType | enum | EarlyCheckIn, LateCheckout, ExtraPerson, Incidental, ServiceFee, SnackBeverage, StayExtension. |
| Label | string | Bill label. |
| Quantity | int | Units. |
| Nights | int | Extra-person nights multiplier. |
| UnitAmount | decimal | Per unit. |
| Amount | decimal | Line total. |
| CreatedAtUtc | DateTime | When added. |

**Relationships:** N→1 `Booking`.

### StayReview — **Weak / dependent**

**Purpose:** Guest review for one completed stay.

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| BookingId | FK → Booking (cascade), unique | One review per stay. |
| GuestUserId | string | Guest account id. |
| DisplayName | string | Public name. |
| OverallRating | byte | Overall score. |
| StaffRating | byte | Staff score. |
| ComfortRating | byte | Comfort score. |
| FacilitiesRating | byte | Facilities score. |
| WouldRecommend | bool? | Recommend flag. |
| Comment | string? | Free text. |
| TagsJson | string? | Tag list JSON. |
| IsPublished | bool | Visible on public site. |
| HotelReply | string? | Hotel response. |
| HotelReplyAtUtc | DateTime? | Reply time. |
| HotelReplyBy | string? | Staff who replied. |
| CreatedAtUtc | DateTime | Created. |
| UpdatedAtUtc | DateTime | Updated. |

**Relationships:** N→1 `Booking` (1:1 enforced by unique `BookingId`).

---

## 3. Money

### PaymentRecord — **Weak / dependent**

**Purpose:** Posted (or voided) payment against a stay. Rows are not edited; bad payments are voided.

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| BookingId | FK → Booking (cascade) | Parent stay. |
| ReceiptNumber | string, unique | Receipt code. |
| EventType | enum | Deposit, ArrivalPayment, BalanceSettlement, Refund, Adjustment. |
| Method | enum | Cash, EWallet, BankTransfer, Card, Maya, Other. |
| Amount | decimal | Amount. |
| StayTotalAtPosting | decimal | Stay total when posted. |
| BalanceAfter | decimal | Remaining balance. |
| PaidAtUtc | DateTime | Posted at. |
| ReceivedBy | string | Staff name. |
| Notes | string? | Comment. |
| Status | enum | Posted or Voided. |
| ExternalReference | string? | E-wallet / InstaPay ref. |
| BankTransferReference | string? | Bank clearing ref. |
| ReceiptImagePath | string? | Receipt image path. |
| VoidedAtUtc | DateTime? | Void time. |
| VoidReason | string? | Void reason. |
| VoidedBy | string? | Who voided. |

**Relationships:** N→1 `Booking`.

---

## 4. Promos

### SpecialOffer — **Strong**

**Purpose:** Promo rate for **one** room type (sibling rows for multi-type campaigns).

| Attribute | Type / notes | Meaning |
|---|---|---|
| Id | PK, int | Unique id. |
| RoomTypeId | FK → RoomType (cascade) | Target type. |
| Kind | enum | LimitedTime, StayLongerSaveMore, (legacy kinds may exist). |
| Title | string | Campaign name. |
| Description | string? | Details. |
| RegularPricePerNight | decimal | Comparison / “was” price. |
| PromoPricePerNight | decimal? | Promo nightly rate. |
| MinNights | int? | Min nights (Stay Longer). |
| Channels | flags int | Online / walk-in / front desk / third-party visibility. |
| CashOnly | bool | Cash-only. |
| IsActive | bool | Active flag. |
| LoyaltyApplyMode | enum int | Loyalty application mode. |
| StartsAtUtc | DateTime | Start. |
| EndsAtUtc | DateTime | End. |
| OpenEnded | bool | No hard end when true. |
| SortOrder | int | Display order. |
| CreatedAtUtc | DateTime | Created. |
| UpdatedAtUtc | DateTime | Updated. |

**Relationships:** N→1 `RoomType`; optionally referenced by `Booking.SpecialOfferId`.

---

## 5. Staff / auth

Table names come from `StaffAuthSchema` (`StaffUser`, `StaffRole`, `StaffExternalLogin`, `StaffAuthToken`, `StaffPasswordResetCode`).

### StaffRole — **Strong**

| Attribute | Meaning |
|---|---|
| Id | PK (string). |
| Name | Role name (`AdminManager`, `Receptionist`, reserved `Guest`). |
| NormalizedName | Lookup form. |
| ConcurrencyStamp | Concurrency token. |

**Relationships:** 1→N `StaffUser`.

### StaffUser (`ApplicationUser`) — **Strong**

| Attribute | Meaning |
|---|---|
| Id | PK (string). |
| UserName / NormalizedUserName | Login. |
| Email / NormalizedEmail / EmailConfirmed | Email. |
| PasswordHash | Hashed password. |
| SecurityStamp / ConcurrencyStamp | Identity stamps. |
| PhoneNumber / PhoneNumberConfirmed | Phone. |
| TwoFactorEnabled | 2FA flag. |
| LockoutEnd / LockoutEnabled / AccessFailedCount | Lockout. |
| FullName | Display name. |
| BirthDate | DOB. |
| Address | Address. |
| MustChangePassword | Force change on next login. |
| RoleId | FK → StaffRole (set-null). |
| GoogleEmail / NormalizedGoogleEmail | Recovery Gmail. |
| GoogleVerificationStatus | NotLinked / Pending / GoogleVerified. |
| DashboardLayoutJson | Admin dashboard layout. |

**Relationships:** N→1 `StaffRole`; 1→N external logins, tokens, reset codes; shifts by `StaffUserId`.

### StaffExternalLogin — **Identity satellite**

| Attribute | Meaning |
|---|---|
| LoginProvider + ProviderKey | Composite PK. |
| ProviderDisplayName | Label. |
| UserId | FK → StaffUser. |

### StaffAuthToken — **Identity satellite**

| Attribute | Meaning |
|---|---|
| UserId + LoginProvider + Name | Composite PK. |
| Value | Token value. |

### StaffPasswordResetCode — **Weak / dependent**

| Attribute | Meaning |
|---|---|
| Id | PK. |
| UserId | Staff user id. |
| NormalizedEmail | Email snapshot. |
| CodeHash | Hashed OTP. |
| CreatedAtUtc / ExpiresAtUtc | Validity window. |
| ConsumedAtUtc | Used time. |
| FailedAttempts | Fail count. |

---

## 6. Settings, audit, export metadata

### SecureSetting — **Strong**

**Purpose:** Encrypted vault (SMTP, Gemini, Groq, Google OAuth, …).

| Attribute | Meaning |
|---|---|
| Id | PK. |
| Key | Unique setting key. |
| Ciphertext | Encrypted value. |
| UpdatedUtc | Last update. |

### SystemAuditLog — **Strong** (append-only)

**Purpose:** Operational audit trail (account, booking, payment, room, offer actions). **Not deleted** by flush.

| Attribute | Meaning |
|---|---|
| Id | PK (long). |
| AtUtc | When. |
| Intent | Create / Update / Delete / Other. |
| Domain | Account, Booking, Payment, Room, Offer, System, …. |
| Action | Action code. |
| ActorUserId / ActorDisplayName | Who. |
| TargetType / TargetId / TargetLabel | What. |
| Reason | Optional reason. |
| Summary | Human summary. |

### SystemFlushLog — **Strong**

**Purpose:** Metadata after retention **export** actions (app retains ~7 days).

| Attribute | Meaning |
|---|---|
| Id | PK. |
| Kind | BookingHistory, Payments, StaffAudit. |
| FlushedAtUtc | When. |
| PerformedBy | Staff name entered. |
| RecordCount | Rows in export. |
| FileName | PDF/ZIP name. |
| Summary | Short description. |

---

## 7. EF helper

### __EFMigrationsHistory

| Attribute | Meaning |
|---|---|
| MigrationId | Applied migration name. |
| ProductVersion | EF version. |

Not hotel business data — do not edit by hand.

---

## Tables removed on purpose

| Old / wrong name | Status |
|---|---|
| StaffAccount (as table name) | Renamed to **StaffUser** |
| StaffAccountLogin / StaffAccountToken | Renamed to **StaffExternalLogin** / **StaffAuthToken** |
| StaffAccountRole / StaffAccountClaim / StaffRoleClaim | Dropped; role is `StaffUser.RoleId` |
| StaffAccountAudit | Replaced by **SystemAuditLog** (Account domain) |

---

## Code map

| Table | C# type | Config |
|---|---|---|
| RoomType | `RoomType` | `HotelBookingDbContext` |
| Room | `Room` | same |
| Booking | `Booking` | same |
| BookingItem | `BookingItem` | same |
| BookingRoomAssignment | `BookingRoomAssignment` | same |
| BookingCharge | `BookingCharge` | same |
| PaymentRecord | `PaymentRecord` | same |
| SpecialOffer | `SpecialOffer` | same |
| StayReview | `StayReview` | same |
| StaffUser | `ApplicationUser` | `StaffAuthSchema.UserTable` |
| StaffRole | `IdentityRole` | `StaffAuthSchema.RoleTable` |
| StaffExternalLogin | Identity login | `StaffAuthSchema.ExternalLoginTable` |
| StaffAuthToken | Identity token | `StaffAuthSchema.AuthTokenTable` |
| StaffPasswordResetCode | `StaffPasswordResetCode` | same |
| SecureSetting | `SecureSetting` | same |
| SystemAuditLog | `SystemAuditLog` | same |
| SystemFlushLog | `SystemFlushLog` | same |

Models: `TestingDemo/Models/`. Context: `TestingDemo/Data/HotelBookingDbContext.cs`.
