/* ==========================================================================
   Mori demo seed — 50 guests with bookings, reservations and payment
   records spread across the last ~40 days and next ~30 days, sized for
   dashboard/report testing. Idempotent: wipes prior DMO-% rows first
   (booking delete cascades to items + payments). Safe to rerun.

   Run:
     sqlcmd -S "(localdb)\mssqllocaldb" -E -d "<database>" -i seed-demo-50.sql -b
   ========================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

DECLARE @nowUtc datetime2 = SYSUTCDATETIME();
DECLARE @todayUtc datetime2 = CAST(CAST(@nowUtc AS date) AS datetime2);

/* ---- cleanup prior demo data ---------------------------------------- */
DELETE FROM Booking WHERE Reference LIKE 'DMO-%';  /* cascades items/payments */

/* ---- 50 bookings ----------------------------------------------------- */
/* i 1-30  : past stays → CheckedOut (80%) / Cancelled / Rejected         */
/* i 31-50 : upcoming stays → Confirmed / Pending                         */
WITH n AS (
    SELECT TOP (50) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values
),
src AS (
    SELECT
        i,
        CASE
            WHEN i <= 30 THEN CASE WHEN i % 10 < 8 THEN 'CheckedOut'
                                   WHEN i % 10 = 8 THEN 'Cancelled'
                                   ELSE 'Rejected' END
            WHEN i % 3 = 2 THEN 'Pending'
            ELSE 'Confirmed'
        END AS status,
        CASE WHEN i <= 30 THEN 'Booking' ELSE 'Reservation' END AS kind,
        CASE
            WHEN i <= 30 THEN DATEADD(hour, 6, DATEADD(day, -(1 + i % 40), @todayUtc))
            ELSE DATEADD(hour, 6, DATEADD(day, 1 + i % 30, @todayUtc))
        END AS checkinUtc,
        1 + (i % 5) AS nights,
        CASE WHEN i % 3 = 0 THEN 'Half' ELSE 'Full' END AS payOpt,
        CASE i % 5 WHEN 0 THEN 'WalkIn' WHEN 3 THEN 'Agoda' WHEN 4 THEN 'Expedia'
                   ELSE 'Online' END AS channel,
        CASE WHEN i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END AS type1Name,
        CASE WHEN i % 2 = 0 THEN N'Twin Room' ELSE N'Queen Rooms' END AS type2Name,
        1 + (i % 2) AS qty1,
        CASE WHEN i % 5 = 0 THEN 1 ELSE 0 END AS qty2
    FROM n
)
INSERT INTO Booking (
    Reference, GuestName, GuestEmail, GuestPhone,
    CheckInAtUtc, CheckoutTimeUtc, Kind, PaymentOption, Status, Channel,
    ArrivalDiscountRequest, CashOnlyPromo, SpecialOfferId,
    TotalAmount, AmountDueNow,
    AdultCount, ChildCount, GuestPartyJson,
    CreatedAtUtc, UpdatedAtUtc, IsArchived, ArchivedAtUtc,
    IsNotificationCleared, GuestEditsSeenByStaff
)
SELECT
    'DMO-' + RIGHT('0000' + CAST(s.i AS varchar(4)), 4),
    N'Demo Guest ' + RIGHT('00' + CAST(s.i AS varchar(4)), 2),
    'demo.guest' + RIGHT('00' + CAST(s.i AS varchar(4)), 2) + '@demo.test',
    '+63 9' + RIGHT('000000000' + CAST(170000000 + s.i * 137 AS varchar(10)), 9),
    s.checkinUtc,
    DATEADD(day, s.nights, s.checkinUtc),
    s.kind, s.payOpt, s.status, s.channel,
    'None', 0, NULL,
    (s.qty1 * rt1.PricePerNight + s.qty2 * ISNULL(rt2.PricePerNight, 0)) * s.nights,
    CASE WHEN s.payOpt = 'Half'
         THEN ROUND((s.qty1 * rt1.PricePerNight + s.qty2 * ISNULL(rt2.PricePerNight, 0)) * s.nights / 2, 2)
         ELSE (s.qty1 * rt1.PricePerNight + s.qty2 * ISNULL(rt2.PricePerNight, 0)) * s.nights END,
    s.qty1 + s.qty2,                                   /* adults ≈ 1/room */
    CASE WHEN s.i % 6 = 0 THEN 1 ELSE 0 END,
    '[{"adults":' + CAST(s.qty1 + s.qty2 AS varchar(2)) + ',"children":'
        + CAST(CASE WHEN s.i % 6 = 0 THEN 1 ELSE 0 END AS varchar(1)) + '}]',
    DATEADD(day, -(3 + s.i % 6), s.checkinUtc),
    @nowUtc,
    0, NULL, 0, 1
FROM src s
JOIN RoomType rt1 ON rt1.Name = s.type1Name
LEFT JOIN RoomType rt2 ON rt2.Name = s.type2Name AND s.qty2 > 0;

/* ---- booking items (primary type always, secondary on every 5th) ----- */
INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name, 1 + (x.i % 2), rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE WHEN x.i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END
WHERE b.Reference LIKE 'DMO-%';

INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name, 1, rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE WHEN x.i % 2 = 0 THEN N'Twin Room' ELSE N'Queen Rooms' END
WHERE b.Reference LIKE 'DMO-%' AND x.i % 5 = 0;

/* ---- payments --------------------------------------------------------- */
/* Confirmed + CheckedOut: first payment covers AmountDueNow (full stay
   when PaymentOption = Full, half when Half). E-wallet every 4th; one
   receipt left unverified, one voided (wrong amount at desk).           */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT
    b.Id,
    'RCP-D' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) + '-1',
    CASE WHEN b.Status = 'CheckedOut' THEN 'ArrivalPayment' ELSE 'Deposit' END,
    CASE WHEN x.i % 4 = 0 THEN 'EWallet' ELSE 'Cash' END,
    b.AmountDueNow,
    b.TotalAmount,
    b.TotalAmount - b.AmountDueNow,
    DATEADD(hour, 2, b.CreatedAtUtc), 'Demo Seed', NULL,
    CASE WHEN x.i = 40 THEN 'Voided' ELSE 'Posted' END,
    CASE WHEN x.i % 4 = 0 THEN 'TEST-EPAY-' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) ELSE NULL END,
    CASE WHEN x.i % 4 = 0 AND x.i NOT IN (36, 40) THEN DATEADD(hour, 3, b.CreatedAtUtc) ELSE NULL END,
    CASE WHEN x.i % 4 = 0 AND x.i NOT IN (36, 40) THEN 'Demo Seed' ELSE NULL END,
    CASE WHEN x.i = 40 THEN DATEADD(hour, 4, b.CreatedAtUtc) ELSE NULL END,
    CASE WHEN x.i = 40 THEN 'Demo seed: wrong amount keyed at desk' ELSE NULL END,
    CASE WHEN x.i = 40 THEN 'Demo Seed' ELSE NULL END
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
WHERE b.Reference LIKE 'DMO-%'
  AND b.Status IN ('Confirmed', 'CheckedOut');

/* CheckedOut half-paid stays: balance settled at checkout. */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT
    b.Id,
    'RCP-D' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) + '-2',
    'BalanceSettlement',
    'Cash',
    b.TotalAmount - b.AmountDueNow,
    b.TotalAmount,
    0,
    DATEADD(hour, -2, b.CheckoutTimeUtc), 'Demo Seed', NULL, 'Posted',
    NULL, NULL, NULL, NULL, NULL, NULL
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
WHERE b.Reference LIKE 'DMO-%'
  AND b.Status = 'CheckedOut'
  AND b.PaymentOption = 'Half';

/* One cancelled booking keeps a voided receipt (refund handled at desk). */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT TOP 1
    b.Id, 'RCP-D0008-R', 'Refund', 'Cash', b.AmountDueNow,
    b.TotalAmount, b.TotalAmount, b.UpdatedAtUtc, 'Demo Seed',
    'Demo seed: deposit refunded on cancellation', 'Voided', NULL,
    NULL, NULL, b.UpdatedAtUtc, 'Demo seed: guest cancelled — deposit returned', 'Demo Seed'
FROM Booking b
WHERE b.Reference = 'DMO-0008';

/* ---- arrivals this week + reservation wave (feeds the trend charts) --- */
/* i 51-60 : check-ins spread over the last 7 Manila days — recent ones   */
/*           still in-house (Confirmed), earlier ones CheckedOut.         */
/* i 61-75 : upcoming reservations every ~2 days for the next month,      */
/*           Confirmed (deposit posted) / Pending (unpaid).               */
WITH n AS (
    SELECT TOP (25) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values
),
src AS (
    SELECT
        50 + i AS i,
        CASE
            WHEN i <= 10 THEN CASE WHEN i <= 3 THEN 'CheckedOut' ELSE 'Confirmed' END
            WHEN i % 3 = 0 THEN 'Pending'
            ELSE 'Confirmed'
        END AS status,
        CASE WHEN i <= 10 THEN 'Booking' ELSE 'Reservation' END AS kind,
        CASE
            WHEN i <= 10 THEN DATEADD(hour, 6, DATEADD(day, -(i - 1), @todayUtc))
            ELSE DATEADD(hour, 6, DATEADD(day, 1 + (i - 10) * 2, @todayUtc))
        END AS checkinUtc,
        1 + (i % 4) AS nights,
        CASE WHEN i % 4 = 0 THEN 'Half' ELSE 'Full' END AS payOpt,
        CASE WHEN i <= 10 THEN 'Online'
             ELSE CASE i % 4 WHEN 0 THEN 'Agoda' WHEN 1 THEN 'Expedia' ELSE 'Online' END
        END AS channel,
        CASE WHEN i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END AS type1Name,
        1 + (i % 2) AS qty1
    FROM n
)
INSERT INTO Booking (
    Reference, GuestName, GuestEmail, GuestPhone,
    CheckInAtUtc, CheckoutTimeUtc, Kind, PaymentOption, Status, Channel,
    ArrivalDiscountRequest, CashOnlyPromo, SpecialOfferId,
    TotalAmount, AmountDueNow,
    AdultCount, ChildCount, GuestPartyJson,
    CreatedAtUtc, UpdatedAtUtc, IsArchived, ArchivedAtUtc,
    IsNotificationCleared, GuestEditsSeenByStaff
)
SELECT
    'DMO-' + RIGHT('0000' + CAST(s.i AS varchar(4)), 4),
    N'Demo Guest ' + RIGHT('00' + CAST(s.i AS varchar(4)), 2),
    'demo.guest' + RIGHT('00' + CAST(s.i AS varchar(4)), 2) + '@demo.test',
    '+63 9' + RIGHT('000000000' + CAST(170000000 + s.i * 137 AS varchar(10)), 9),
    s.checkinUtc,
    DATEADD(day, s.nights, s.checkinUtc),
    s.kind, s.payOpt, s.status, s.channel,
    'None', 0, NULL,
    s.qty1 * rt1.PricePerNight * s.nights,
    CASE WHEN s.payOpt = 'Half'
         THEN ROUND(s.qty1 * rt1.PricePerNight * s.nights / 2, 2)
         ELSE s.qty1 * rt1.PricePerNight * s.nights END,
    s.qty1, 0,
    '[{"adults":' + CAST(s.qty1 AS varchar(2)) + ',"children":0}]',
    DATEADD(day, -(2 + s.i % 5), s.checkinUtc),
    @nowUtc,
    0, NULL, 0, 1
FROM src s
JOIN RoomType rt1 ON rt1.Name = s.type1Name;

INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name, 1 + (x.i % 2), rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE WHEN x.i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END
WHERE b.Reference LIKE 'DMO-00%' AND x.i > 50;

/* Payments for the arrival/reservation batch:
   Confirmed → posted deposit (e-wallet every 3rd); CheckedOut → settled. */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT
    b.Id,
    'RCP-D' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) + '-1',
    CASE WHEN b.Status = 'CheckedOut' THEN 'ArrivalPayment' ELSE 'Deposit' END,
    CASE WHEN x.i % 3 = 0 THEN 'EWallet' ELSE 'Cash' END,
    b.AmountDueNow,
    b.TotalAmount,
    b.TotalAmount - b.AmountDueNow,
    DATEADD(hour, 2, b.CreatedAtUtc), 'Demo Seed', NULL, 'Posted',
    CASE WHEN x.i % 3 = 0 THEN 'TEST-EPAY-' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) ELSE NULL END,
    CASE WHEN x.i % 3 = 0 THEN DATEADD(hour, 3, b.CreatedAtUtc) ELSE NULL END,
    CASE WHEN x.i % 3 = 0 THEN 'Demo Seed' ELSE NULL END,
    NULL, NULL, NULL
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
WHERE b.Reference LIKE 'DMO-00%' AND x.i > 50
  AND b.Status IN ('Confirmed', 'CheckedOut');

/* CheckedOut half-paid arrivals: balance settled at checkout. */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT
    b.Id,
    'RCP-D' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) + '-2',
    'BalanceSettlement', 'Cash',
    b.TotalAmount - b.AmountDueNow, b.TotalAmount, 0,
    DATEADD(hour, -2, b.CheckoutTimeUtc), 'Demo Seed', NULL, 'Posted',
    NULL, NULL, NULL, NULL, NULL, NULL
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
WHERE b.Reference LIKE 'DMO-00%' AND x.i > 50
  AND b.Status = 'CheckedOut' AND b.PaymentOption = 'Half';

/* ---- reservation wave across the next 6 months (DMO-0076..0105) ------- */
/* Spread one every ~6 days so ANY forward report range — including the     */
/* availability-by-type grid — shows bookings deducting inventory.          */
/* Confirmed ones carry a posted deposit; Pending ones are unpaid.          */
WITH n AS (
    SELECT TOP (30) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values
),
src AS (
    SELECT
        75 + i AS i,
        CASE WHEN i % 4 = 0 THEN 'Pending' ELSE 'Confirmed' END AS status,
        'Reservation' AS kind,
        DATEADD(hour, 6, DATEADD(day, 1 + (i - 1) * 6, @todayUtc)) AS checkinUtc,
        1 + (i % 4) AS nights,
        CASE WHEN i % 3 = 0 THEN 'Half' ELSE 'Full' END AS payOpt,
        CASE i % 4 WHEN 0 THEN 'Agoda' WHEN 1 THEN 'Expedia' WHEN 2 THEN 'Online'
                   ELSE 'OtherThirdParty' END AS channel,
        CASE WHEN i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END AS type1Name,
        1 + (i % 2) AS qty1
    FROM n
)
INSERT INTO Booking (
    Reference, GuestName, GuestEmail, GuestPhone,
    CheckInAtUtc, CheckoutTimeUtc, Kind, PaymentOption, Status, Channel,
    ArrivalDiscountRequest, CashOnlyPromo, SpecialOfferId,
    TotalAmount, AmountDueNow,
    AdultCount, ChildCount, GuestPartyJson,
    CreatedAtUtc, UpdatedAtUtc, IsArchived, ArchivedAtUtc,
    IsNotificationCleared, GuestEditsSeenByStaff
)
SELECT
    'DMO-' + RIGHT('0000' + CAST(s.i AS varchar(4)), 4),
    N'Demo Guest ' + RIGHT('00' + CAST(s.i AS varchar(4)), 2),
    'demo.guest' + RIGHT('00' + CAST(s.i AS varchar(4)), 2) + '@demo.test',
    '+63 9' + RIGHT('000000000' + CAST(170000000 + s.i * 137 AS varchar(10)), 9),
    s.checkinUtc,
    DATEADD(day, s.nights, s.checkinUtc),
    s.kind, s.payOpt, s.status, s.channel,
    'None', 0, NULL,
    s.qty1 * rt1.PricePerNight * s.nights,
    CASE WHEN s.payOpt = 'Half'
         THEN ROUND(s.qty1 * rt1.PricePerNight * s.nights / 2, 2)
         ELSE s.qty1 * rt1.PricePerNight * s.nights END,
    s.qty1, 0,
    '[{"adults":' + CAST(s.qty1 AS varchar(2)) + ',"children":0}]',
    DATEADD(day, -(7 + s.i % 10), @nowUtc),
    @nowUtc,
    0, NULL, 0, 1
FROM src s
JOIN RoomType rt1 ON rt1.Name = s.type1Name;

INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name, 1 + (x.i % 2), rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE WHEN x.i % 2 = 0 THEN N'Queen Rooms' ELSE N'Twin Room' END
WHERE b.Reference LIKE 'DMO-00%' AND x.i > 75;

/* Deposits on the Confirmed reservations (e-wallet every 3rd). */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference,
    VerifiedAtUtc, VerifiedBy, VoidedAtUtc, VoidReason, VoidedBy
)
SELECT
    b.Id,
    'RCP-D' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) + '-1',
    'Deposit',
    CASE WHEN x.i % 3 = 0 THEN 'EWallet' ELSE 'Cash' END,
    b.AmountDueNow,
    b.TotalAmount,
    b.TotalAmount - b.AmountDueNow,
    DATEADD(hour, 2, b.CreatedAtUtc), 'Demo Seed', NULL, 'Posted',
    CASE WHEN x.i % 3 = 0 THEN 'TEST-EPAY-' + RIGHT('0000' + CAST(x.i AS varchar(4)), 4) ELSE NULL END,
    CASE WHEN x.i % 3 = 0 THEN DATEADD(hour, 3, b.CreatedAtUtc) ELSE NULL END,
    CASE WHEN x.i % 3 = 0 THEN 'Demo Seed' ELSE NULL END,
    NULL, NULL, NULL
FROM Booking b
CROSS APPLY (SELECT TRY_CAST(RIGHT(b.Reference, 4) AS int) AS i) x
WHERE b.Reference LIKE 'DMO-00%' AND x.i > 75
  AND b.Status = 'Confirmed';

COMMIT;

SELECT
    COUNT(*) AS DemoBookings,
    SUM(CASE WHEN Kind = 'Reservation' THEN 1 ELSE 0 END) AS Reservations,
    SUM(CASE WHEN Status = 'CheckedOut' THEN 1 ELSE 0 END) AS CheckedOut,
    SUM(CASE WHEN Status = 'Confirmed' THEN 1 ELSE 0 END) AS Confirmed,
    SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) AS Pending,
    SUM(CASE WHEN Status = 'Cancelled' THEN 1 ELSE 0 END) AS Cancelled,
    SUM(CASE WHEN Status = 'Rejected' THEN 1 ELSE 0 END) AS Rejected
FROM Booking WHERE Reference LIKE 'DMO-%';

SELECT COUNT(*) AS DemoPayments
FROM PaymentRecord p JOIN Booking b ON b.Id = p.BookingId
WHERE b.Reference LIKE 'DMO-%';
