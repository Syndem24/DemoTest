# Mori International Hotel — HotelDb schema

Live SQL Server model for `HotelBookingDbContext` (ASP.NET Core / EF Core 9).  
Dates are stored **UTC**; UI shows **Philippines (Manila)** time.  
Generated: 2026-09-11.

Docx: run `docs/HotelDb-Schema-updated.docs.ps1` → `HotelDb-Schema-updated.docx` (+ `HotelDb-Schema.docx` when unlocked).

## Entity type legend

| Type | Meaning |
|------|---------|
| Strong | Own primary key; independent identity |
| Weak / dependent | Surrogate key; owned by parent (often cascade) |
| Associative | Bridge (assignment / many-to-many) |
| Identity satellite | ASP.NET Identity support table |

## Master list

| Table | ER type | PK | Relationships |
|-------|---------|----|---------------|
| RoomType | Strong | RoomTypeId | 1→N Room, SpecialOffer; optional BookingItem |
| Room | Strong | Id | N→1 RoomType; BookingRoomAssignment |
| Booking | Strong | Id | opt→SpecialOffer; 1→N Item/Charge/Payment; 1→0..1 StayReview |
| BookingItem | Weak | Id | N→1 Booking; opt→RoomType; 1→N Assignment |
| BookingRoomAssignment | Associative | Id | BookingItem ↔ Room; unique pair |
| BookingCharge | Weak | Id | N→1 Booking |
| PaymentRecord | Weak | Id | N→1 Booking |
| SpecialOffer | Strong | Id | N→1 RoomType; optional Booking |
| StayReview | Weak | Id | N→1 Booking; unique BookingId |
| StaffRole | Strong | Id | 1→N StaffUser |
| StaffUser | Strong | Id | N→1 StaffRole; logins/tokens/reset |
| StaffExternalLogin | Identity satellite | Provider+Key | N→1 StaffUser |
| StaffAuthToken | Identity satellite | User+Provider+Name | N→1 StaffUser |
| StaffPasswordResetCode | Weak | Id | → StaffUser |
| SecureSetting | Strong | Id | Vault (standalone) |
| SystemAuditLog | Strong | Id | Append-only |
| SystemFlushLog | Strong | Id | Export metadata (~7-day retention) |
| __EFMigrationsHistory | Tooling | MigrationId | EF only |

## 1. Inventory

### RoomType (strong)
Sellable category (Queen, Twin, …). Door numbers live in `Room`.

| Attribute | Purpose |
|-----------|---------|
| RoomTypeId | PK |
| Name | Unique display name |
| Description | Guest-facing text |
| CreatedAt | Created (UTC) |
| Inclusions | Amenities/inclusions JSON list |
| Images | Photo paths JSON |
| PricePerNight | Standard nightly rate |
| MaxOccupancy | Max guests |
| BedCount | Beds |

### Room (strong)
One physical guest room.

| Attribute | Purpose |
|-----------|---------|
| Id | PK |
| RoomTypeId | FK → RoomType |
| RoomNumber | Unique door number |
| Status | Available, Unavailable, Occupied, Cleaning |

## 2. Guest stays

### Booking (strong)
One stay (Online, WalkIn, FrontDeskExtension, OTA channels).

| Attribute | Purpose |
|-----------|---------|
| Id | PK |
| Reference | Unique confirmation code |
| GuestName / GuestEmail / GuestPhone | Contact |
| CheckInAtUtc / CheckoutTimeUtc | Stay window (UTC) |
| Kind | Booking or Reservation |
| PaymentOption | Full or Half |
| Status | Pending, Confirmed, Rejected, Cancelled, CheckedOut |
| Channel | Online, WalkIn, FrontDeskExtension, Agoda, Expedia, RedDoorz, OtherThirdParty |
| ArrivalDiscountRequest | None / SeniorCitizen / Pwd |
| CashOnlyPromo | Cash-only stay |
| SpecialOfferId | Optional promo FK |
| TotalAmount / AmountDueNow | Money |
| AdultCount / ChildCount / GuestPartyJson | Party (JSON per-room heads / extraPerson flags) |
| CreatedAtUtc / UpdatedAtUtc | Timestamps |
| IsArchived / ArchivedAtUtc | History |
| IsNotificationCleared | Admin bell hide |
| ArrivalWarningSentAtUtc / PendingCallWarningSentAtUtc / CheckoutWarningSentAtUtc | Warning stamps |

### BookingItem (weak)
Room-type line (qty × nightly rate).

| Attribute | Purpose |
|-----------|---------|
| Id | PK |
| BookingId | FK → Booking (cascade) |
| RoomTypeId | Optional FK → RoomType |
| RoomTypeName | Name snapshot |
| Quantity | Room count |
| PricePerNight | Line rate |

### BookingRoomAssignment (associative)
Assigns physical `Room` to a `BookingItem`. Unique (BookingItemId, RoomId).

### BookingCharge (weak)
Fees: EarlyCheckIn, LateCheckout, ExtraPerson, Incidental, ServiceFee, SnackBeverage, StayExtension, discounts/loyalty as charged.

## 3. Money

### PaymentRecord (weak)
Posted/voided payment. Methods: Cash, EWallet (preferred), legacy Card/BankTransfer/Maya/Other. Events: Deposit, ArrivalPayment, BalanceSettlement, Refund, Adjustment. Stores ExternalReference, ReceiptImagePath; void metadata. **No card PAN.**

## 4. Promos

### SpecialOffer (strong)
Per RoomType campaign: LimitedTime, StayLongerSaveMore, GoogleLoyalty (+ legacy kinds). Channels flags, CashOnly, OpenEnded, LoyaltyApplyMode, schedule UTC.

## 5. Reviews

### StayReview (weak)
One review per BookingId. Ratings overall/staff/comfort/facilities; tags JSON; publish flag; hotel reply fields.

## 6. Staff / auth

Tables: **StaffUser** (`ApplicationUser`), **StaffRole**, **StaffExternalLogin**, **StaffAuthToken**, **StaffPasswordResetCode**.  
Profile: FullName, BirthDate, Address, MustChangePassword, RoleId, Google recovery fields, DashboardLayoutJson.

## 7. Settings, audit, export

- **SecureSetting** — encrypted vault (SMTP, Gemini, Groq, Google OAuth, …)
- **SystemAuditLog** — append-only ops audit
- **SystemFlushLog** — flush/export metadata (BookingHistory, Payments, …)

## Renames

| Old | Current |
|-----|---------|
| StaffAccount* | StaffUser / StaffExternalLogin / StaffAuthToken |
| StaffAccountAudit | SystemAuditLog (Account domain) |
| StaffShift | Removed |
| Amenity / Inclusion / RoomAmenity tables | RoomType.Inclusions JSON (current inventory model) |

## Code map

| Table | C# |
|-------|-----|
| RoomType | `RoomType` |
| Room | `Room` |
| Booking / Item / Assignment / Charge | `Booking*` |
| PaymentRecord | `PaymentRecord` |
| SpecialOffer | `SpecialOffer` |
| StayReview | `StayReview` |
| StaffUser | `ApplicationUser` |
| StaffRole | `IdentityRole` |
| SecureSetting / SystemAuditLog / SystemFlushLog | matching models |

Context: `TestingDemo/Data/HotelBookingDbContext.cs` · Models: `TestingDemo/Models/`.
