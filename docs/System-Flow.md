# Mori International Hotel — Proposed Flow of the System

This document describes the proposed flow of the system — the sequence of processes
and interactions within the application. Guests book rooms through the public website,
and staff record bookings, payments, room assignments, and refunds directly into a
centralized web-based database that automatically logs every activity to the audit
trail. Staff can search, filter, and view real-time room availability, booking lists,
payment ledgers, and transaction history without paper or spreadsheets.

## 1. End-to-end booking flow

```mermaid
flowchart TD
    A([Guest opens Mori International Hotel site]) --> B[Browse rooms, offers,<br/>gallery & reviews on homepage]
    B --> C[Accommodations wizard:<br/>dates → guests → rooms → offer]
    C --> D[Guest details + accept Terms of Stay]
    D --> E[Submit booking request]
    E --> F{Channel}
    F -->|Online guest| G[Booking created — status: PENDING<br/>staff notification bell + SignalR push]
    F -->|Walk-in / OTA| G2[Receptionist encodes booking<br/>directly at the front desk]
    G --> H["Guest returns to homepage — success modal:<br/>'We will contact you for confirmation'"]
    G2 --> I
    H --> I[Receptionist reviews the booking<br/>on the Bookings board / calendar]
    I --> J{Decision}
    J -->|Reject| K[Status: REJECTED → archived to history]
    J -->|Confirm| L[Status: CONFIRMED<br/>guest notified]
    L --> M[Record payment event<br/>cash · e-wallet · bank transfer]
    M --> N{Digital payment?}
    N -->|E-wallet / bank| O[Verify receipt manually<br/>one-click Verify on Payments page]
    N -->|Cash| P{Fully paid?}
    O --> P
    P -->|Deposit only| Q[Balance stays due —<br/>collect on arrival / settlement]
    Q --> M
    P -->|Fully paid| R[Assign physical rooms<br/>Booking → BookingRoomAssignment]
    R --> S[Guest arrives → IN-HOUSE<br/>stay fees may post as BookingCharge]
    S --> T{Checkout time reached}
    T -->|Guest never arrived| Y[Background service marks<br/>NO-SHOW → status: CANCELLED]
    T -->|Normal| U{Balance check}
    U -->|Overpaid| V[Archive blocked —<br/>record Refund event first]
    V --> M
    U -->|Settled| W[Checkout → status: CHECKED-OUT<br/>booking archived to history]
    W --> X[Guest writes one verified review<br/>admin publishes / hides / replies]
```

## 2. What happens inside the system on every action

Every screen above reads and writes through the same pipeline — this is the
"centralized web-based database that automatically logs all activity":

```mermaid
flowchart LR
    subgraph Clients
        G[Guest browser<br/>Razor pages + fetch]
        S[Staff browser<br/>Admin MVC + React rooms SPA]
    end

    G -->|HTTPS| APP[ASP.NET Core MVC<br/>.NET 9]
    S -->|HTTPS| APP

    APP --> VAL[Validation + rate limiting<br/>+ antiforgery on posts]
    VAL --> SVC[Services<br/>Booking · Payment · Room · Review · Offer]
    SVC -->|Serializable transactions<br/>with deadlock retry| EF[EF Core]
    EF --> DB[(SQL Server —<br/>centralized database)]

    SVC -->|every action recorded| AUDIT[SystemAuditLog<br/>actor · action · target · reason]
    APP -->|SignalR push| S
    DB -->|real-time inventory| G

    BG[Hosted services:<br/>auto-checkout · no-show ·<br/>offer-expiry warnings] --> SVC
```

## 3. Staff-side administration flow

```mermaid
flowchart TD
    L[Staff sign-in —<br/>local credentials or Google] --> R{Role}
    R -->|Receptionist| RP[Dashboard · Bookings · Walk-in<br/>Payments · Reviews · Rooms read-only]
    R -->|AdminManager| RA[Everything + Offers · Users<br/>Data Management & Audit · Integration]

    RP --> P1[Bookings: confirm, assign rooms,<br/>no-show handling, checkout/archive]
    RP --> P2[Payments: record, verify e-wallets,<br/>refund, export ledger PDF]
    RP --> P3[Reviews: publish / hide / reply / delete]

    RA --> A1[Special offers: create, schedule,<br/>cash-only promos, Google Loyalty]
    RA --> A2[Users: staff accounts, roles,<br/>lockouts, onboarding]
    RA --> A3[Data: audit trail search/filter,<br/>export history · payments · staff audit,<br/>optional clear-after-export flush]
```

## 4. Key rules the flow enforces

| Rule | Where it happens |
|---|---|
| Rooms are only deducted once a booking is Pending/Confirmed — availability is always live | `BookingService` + room-type availability counts |
| A booking can only be confirmed with rooms **after** it is fully paid | `EnsureFullyPaidForRoomAssignmentAsync` |
| Payments are an append-only ledger — corrections are refunds/voids, never edits | `PaymentRecord` |
| An overpaid stay cannot be archived until a refund is posted | `CheckoutAsync` gate + refund modal |
| Confirmed guests who never arrive become **Cancelled** (no-show), not checked out | `AutomaticCheckoutBackgroundService` |
| One review per booking, only after checkout | unique index on `StayReview.BookingId` |
| Every action lands in `SystemAuditLog` with actor, action, target, and reason | `SystemAuditRecorder` on each service |
| Exports are PDF; "clear after export" keeps rows that still hold payment receipts | `SystemFlushService` |

## 5. Automation running alongside the flow

- **Auto-checkout / no-show loop** — every 15 seconds; archives completed stays,
  cancels confirmed no-shows, fires 10-minute warnings.
- **Offer expiry warnings** — flags promos nearing their end date to staff.
- **Realtime notifications** — SignalR pushes booking, payment, and review events to
  every open staff screen (bell + page badges) without refresh.
- **Audit retention** — staff audit exports can be flushed after export; history and
  payment exports are capped per run and keep receipt-bearing stays.
