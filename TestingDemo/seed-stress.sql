/* ==========================================================================
   Mori stress seed — floods the WHOLE system with test data.
   Idempotent: wipes prior stress rows (TST-%, seed-%, gst-%, ST-* rooms/types/
   offers/logs) then rebuilds. Safe to rerun.
   ========================================================================== */
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
BEGIN TRAN;

DECLARE @nowUtc datetime2 = SYSUTCDATETIME();
DECLARE @todayUtc datetime2 = CAST(CAST(@nowUtc AS date) AS datetime2);

/* ---- cleanup prior stress data -------------------------------------- */
DELETE FROM StayReview WHERE GuestUserId LIKE 'gst-%';
DELETE FROM Booking WHERE Reference LIKE 'TST-%';            /* cascades items/payments */
DELETE FROM SystemAuditLog WHERE ActorUserId LIKE 'seed-%';
DELETE FROM SystemFlushLog WHERE PerformedBy = 'Stress Seed';
DELETE FROM SpecialOffer WHERE Title LIKE 'ST-%';
DELETE FROM Room WHERE RoomTypeId IN (
    SELECT RoomTypeId FROM RoomType WHERE Name IN
    (N'ST-Deluxe King', N'ST-Family Suite', N'ST-Executive Suite', N'ST-Barkada Loft', N'ST-Presidential Suite'));
DELETE FROM RoomType WHERE Name IN
    (N'ST-Deluxe King', N'ST-Family Suite', N'ST-Executive Suite', N'ST-Barkada Loft', N'ST-Presidential Suite');

/* ---- 5 new room types ----------------------------------------------- */
INSERT INTO RoomType (Name, Images, CreatedAt, Description, Inclusions, PricePerNight, MaxOccupancy, BedCount)
VALUES
 (N'ST-Deluxe King', '[]', SYSUTCDATETIME(), N'Stress-test king room with city view.',
  '["air conditioning","bath towels","Smart TV","Wi-Fi","king bed","mini bar"]', 4200.00, 2, 1),
 (N'ST-Family Suite', '[]', SYSUTCDATETIME(), N'Stress-test suite for families.',
  '["air conditioning","bath towels","Smart TV","Wi-Fi","two bedrooms","living area"]', 6500.00, 6, 3),
 (N'ST-Executive Suite', '[]', SYSUTCDATETIME(), N'Stress-test executive suite.',
  '["air conditioning","Smart TV","Wi-Fi","work desk","coffee maker","lounge access"]', 7800.00, 2, 1),
 (N'ST-Barkada Loft', '[]', SYSUTCDATETIME(), N'Stress-test group loft for barkada stays.',
  '["air conditioning","bunk beds","Smart TV","Wi-Fi","game console","shared lounge"]', 5500.00, 8, 4),
 (N'ST-Presidential Suite', '[]', SYSUTCDATETIME(), N'Stress-test top-tier suite.',
  '["air conditioning","Smart TV","Wi-Fi","jacuzzi","butler service","panorama view"]', 15000.00, 4, 2);

/* ---- ~40 rooms for the new types (S601+, S701+, S801+, S901+, S-P01+) - */
;WITH rn AS (
    SELECT TOP (8) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values
)
INSERT INTO Room (RoomTypeId, RoomNumber, Status)
SELECT rt.RoomTypeId,
       CASE rt.Name
           WHEN N'ST-Deluxe King'        THEN 'S6' + RIGHT('0' + CAST(i AS varchar(2)), 2)
           WHEN N'ST-Family Suite'       THEN 'S7' + RIGHT('0' + CAST(i AS varchar(2)), 2)
           WHEN N'ST-Executive Suite'    THEN 'S8' + RIGHT('0' + CAST(i AS varchar(2)), 2)
           WHEN N'ST-Barkada Loft'       THEN 'S9' + RIGHT('0' + CAST(i AS varchar(2)), 2)
           ELSE 'SP' + RIGHT('0' + CAST(i AS varchar(2)), 2)
       END,
       CASE WHEN i = 7 THEN 'Cleaning' WHEN i = 8 THEN 'Unavailable' ELSE 'Available' END
FROM RoomType rt CROSS JOIN rn
WHERE rt.Name IN (N'ST-Deluxe King', N'ST-Family Suite', N'ST-Executive Suite', N'ST-Barkada Loft', N'ST-Presidential Suite');

/* ---- special offers -------------------------------------------------- */
INSERT INTO SpecialOffer (RoomTypeId, Kind, Title, Description, RegularPricePerNight,
    PromoPricePerNight, MinNights, Channels, CashOnly, IsActive, StartsAtUtc, EndsAtUtc,
    SortOrder, CreatedAtUtc, UpdatedAtUtc, LoyaltyApplyMode, OpenEnded)
SELECT rt.RoomTypeId, 'LimitedTime', N'ST-Flash Sale Deluxe King', N'Stress offer — active now.',
       rt.PricePerNight, 3600.00, 1, 7, 0, 1, DATEADD(day, -10, @nowUtc), DATEADD(day, 20, @nowUtc),
       1, @nowUtc, @nowUtc, 0, 0
FROM RoomType rt WHERE rt.Name = N'ST-Deluxe King'
UNION ALL
SELECT rt.RoomTypeId, 'LimitedTime', N'ST-Barkada Weekend', N'Stress offer — cash only promo.',
       rt.PricePerNight, 4900.00, 2, 2, 1, 1, DATEADD(day, -2, @nowUtc), DATEADD(day, 30, @nowUtc),
       2, @nowUtc, @nowUtc, 0, 0
FROM RoomType rt WHERE rt.Name = N'ST-Barkada Loft'
UNION ALL
SELECT rt.RoomTypeId, 'LimitedTime', N'ST-Expired Promo', N'Stress offer — already ended.',
       rt.PricePerNight, 2500.00, 1, 7, 0, 0, DATEADD(day, -60, @nowUtc), DATEADD(day, -30, @nowUtc),
       3, @nowUtc, @nowUtc, 0, 0
FROM RoomType rt WHERE rt.Name = N'ST-Family Suite'
UNION ALL
SELECT rt.RoomTypeId, 'LimitedTime', N'ST-Future Promo', N'Stress offer — not started yet.',
       rt.PricePerNight, 6900.00, 1, 7, 0, 1, DATEADD(day, 15, @nowUtc), DATEADD(day, 45, @nowUtc),
       4, @nowUtc, @nowUtc, 0, 0
FROM RoomType rt WHERE rt.Name = N'ST-Executive Suite'
UNION ALL
SELECT rt.RoomTypeId, 'StayLongerSaveMore', N'ST-Long Stay Saver', N'Stress offer — min 7 nights.',
       rt.PricePerNight, 5600.00, 7, 7, 0, 1, DATEADD(day, -5, @nowUtc), DATEADD(day, 90, @nowUtc),
       5, @nowUtc, @nowUtc, 0, 0
FROM RoomType rt WHERE rt.Name = N'ST-Family Suite'
UNION ALL
SELECT rt.RoomTypeId, 'GoogleLoyalty', N'ST-Google Guest Coupon', N'Stress loyalty coupon ₱500 off.',
       rt.PricePerNight, NULL, NULL, 1, 0, 1, DATEADD(day, -1, @nowUtc), DATEADD(day, 180, @nowUtc),
       6, @nowUtc, @nowUtc, 0, 1
FROM RoomType rt WHERE rt.Name = N'ST-Deluxe King';

/* ---- 700 bookings ---------------------------------------------------- */
WITH n AS (
    SELECT TOP (700) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values a CROSS JOIN master.dbo.spt_values b
),
src AS (
    SELECT
        i,
        CASE
            WHEN i <= 560 THEN CASE WHEN i % 10 < 7 THEN 'CheckedOut'
                                    WHEN i % 10 < 9 THEN 'Cancelled' ELSE 'Rejected' END
            WHEN i <= 585 THEN 'Confirmed'
            WHEN i <= 645 THEN 'Pending'
            ELSE 'Confirmed'
        END AS status,
        CASE
            WHEN i <= 560 THEN DATEADD(hour, 6, DATEADD(day, -(1 + i % 360), @todayUtc))
            WHEN i <= 580 THEN DATEADD(hour, -(2 + i % 6), @nowUtc)
            WHEN i <= 585 THEN DATEADD(hour, 6, DATEADD(day, -2, @todayUtc))
            WHEN i = 646 THEN DATEADD(hour, 6, DATEADD(day, 830, @todayUtc))
            WHEN i = 647 THEN DATEADD(hour, 6, DATEADD(day, 1560, @todayUtc))
            ELSE DATEADD(hour, 6, DATEADD(day, 1 + i % 90, @todayUtc))
        END AS checkinUtc,
        CASE
            WHEN i <= 560 THEN 1 + i % 7
            WHEN i <= 580 THEN 1
            WHEN i <= 585 THEN 4
            WHEN i = 648 THEN 300
            WHEN i = 649 THEN 12
            ELSE 1 + i % 5
        END AS nights,
        CASE WHEN i BETWEEN 649 AND 651 THEN 6 + i % 3 ELSE 1 + i % 2 END AS qty1,
        CASE WHEN i % 5 = 0 THEN 1 + i % 3 ELSE 0 END AS qty2,
        CASE WHEN i % 3 = 0 THEN 'Half' ELSE 'Full' END AS payOpt,
        CASE i % 7
            WHEN 0 THEN 'WalkIn' WHEN 1 THEN 'Online' WHEN 2 THEN 'Online'
            WHEN 3 THEN 'Agoda' WHEN 4 THEN 'Expedia' WHEN 5 THEN 'RedDoorz'
            ELSE 'OtherThirdParty' END AS channel,
        /* primary type cycles all 7 types by name */
        CASE
            WHEN i BETWEEN 649 AND 651 THEN N'ST-Presidential Suite'
            ELSE CASE i % 7
                WHEN 0 THEN N'ST-Deluxe King'
                WHEN 1 THEN N'Queen Room'
                WHEN 2 THEN N'ST-Family Suite'
                WHEN 3 THEN N'Twin Room'
                WHEN 4 THEN N'ST-Executive Suite'
                WHEN 5 THEN N'ST-Barkada Loft'
                ELSE N'Queen Room' END
        END AS type1Name,
        /* secondary type for ~20% — opposite of primary (primary Queen when i%7 in 1,6; Twin when 3) */
        CASE WHEN i % 7 IN (1, 6) THEN N'Twin Room' ELSE N'Queen Room' END AS type2Name
    FROM n
)
INSERT INTO Booking (
    Reference, GuestName, GuestEmail, GuestPhone,
    CheckInAtUtc, CheckoutTimeUtc, Kind, PaymentOption, Status, Channel,
    ArrivalDiscountRequest, CashOnlyPromo, SpecialOfferId,
    TotalAmount, AmountDueNow,
    AdultCount, ChildCount, GuestPartyJson,
    CreatedAtUtc, UpdatedAtUtc, IsArchived, ArchivedAtUtc, IsNotificationCleared,
    ArrivalWarningSentAtUtc, PendingCallWarningSentAtUtc, CheckoutWarningSentAtUtc
)
SELECT
    'TST-' + RIGHT('000000' + CAST(s.i AS varchar(6)), 6),
    CASE
        WHEN s.i = 1 THEN REPLICATE(N'Long', 24) + N'SurnameStressTestMax120'
        WHEN s.i = 2 THEN REPLICATE(N'VeryLongName', 10)
        WHEN s.i = 3 THEN N'Ñandú Wátanabé-Szymańscy von Überlänge the Third'
        WHEN s.i = 4 THEN N'李雷 和 韩梅梅 Family Reunion 🎉'
        WHEN s.i = 5 THEN N'👑 Prince Testing Maximus 🏨 Deluxe'
        ELSE N'Stress Guest ' + CAST(s.i AS varchar(6))
    END,
    CASE
        WHEN s.i <= 2 THEN 'very.long.email.address+' + CAST(s.i AS varchar(3))
            + '@' + REPLICATE('subdomain.', 19) + 'stress-test-hotel.example.com'
        ELSE 'stress.guest' + CAST(s.i AS varchar(6)) + '@stress.test'
    END,
    CASE WHEN s.i = 3 THEN '+63 917 555 0123 ext. 8899 test line #4'
         ELSE '+63 9' + RIGHT('00000000' + CAST(10000000 + s.i AS varchar(9)), 8) END,
    s.checkinUtc,
    DATEADD(day, s.nights, s.checkinUtc),
    CASE WHEN s.payOpt = 'Half' THEN 'Reservation' ELSE 'Booking' END,
    s.payOpt, s.status, s.channel,
    'None', 0, NULL,
    (s.qty1 * rt1.PricePerNight + s.qty2 * rt2.PricePerNight) * s.nights,
    CASE WHEN s.payOpt = 'Half'
         THEN ROUND((s.qty1 * rt1.PricePerNight + s.qty2 * rt2.PricePerNight) * s.nights / 2, 2)
         ELSE (s.qty1 * rt1.PricePerNight + s.qty2 * rt2.PricePerNight) * s.nights END,
    1 + s.i % 3, s.i % 3,
    CASE WHEN s.i % 4 = 0
         THEN '[{"adults":' + CAST(1 + s.i % 3 AS varchar(1)) + ',"children":' + CAST(s.i % 3 AS varchar(1))
              + ',"extraPerson":' + CASE WHEN s.i % 8 = 0 THEN 'true' ELSE 'false' END + '}]'
         ELSE NULL END,
    CASE WHEN s.i <= 560 THEN DATEADD(day, -(5 + s.i % 35), s.checkinUtc)
         ELSE DATEADD(hour, -(s.i % 96), @nowUtc) END,
    CASE WHEN s.i <= 560 THEN DATEADD(hour, 1, DATEADD(day, s.nights, s.checkinUtc)) ELSE @nowUtc END,
    CASE WHEN s.i <= 560 THEN 1 ELSE 0 END,
    CASE WHEN s.i <= 560 THEN DATEADD(hour, 1, DATEADD(day, s.nights, s.checkinUtc)) ELSE NULL END,
    CASE WHEN s.i <= 560 THEN 1 ELSE 0 END,
    NULL, NULL, NULL
FROM src s
JOIN RoomType rt1 ON rt1.Name = s.type1Name
JOIN RoomType rt2 ON rt2.Name = s.type2Name;

/* ---- booking items ---------------------------------------------------- */
INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name,
       CASE WHEN i BETWEEN 649 AND 651 THEN 6 + i % 3 ELSE 1 + i % 2 END,
       rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT CAST(RIGHT(b.Reference, 6) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE
        WHEN i BETWEEN 649 AND 651 THEN N'ST-Presidential Suite'
        ELSE CASE i % 7
            WHEN 0 THEN N'ST-Deluxe King' WHEN 1 THEN N'Queen Room'
            WHEN 2 THEN N'ST-Family Suite' WHEN 3 THEN N'Twin Room'
            WHEN 4 THEN N'ST-Executive Suite' WHEN 5 THEN N'ST-Barkada Loft'
            ELSE N'Queen Room' END
    END
WHERE b.Reference LIKE 'TST-%';

INSERT INTO BookingItem (BookingId, RoomTypeId, RoomTypeName, Quantity, PricePerNight)
SELECT b.Id, rt.RoomTypeId, rt.Name, 1 + i % 3, rt.PricePerNight
FROM Booking b
CROSS APPLY (SELECT CAST(RIGHT(b.Reference, 6) AS int) AS i) x
JOIN RoomType rt ON rt.Name = CASE WHEN i % 7 IN (1, 6) THEN N'Twin Room' ELSE N'Queen Room' END
WHERE b.Reference LIKE 'TST-%' AND i % 5 = 0;

/* ---- payments ---------------------------------------------------------- */
/* checked-out history: ~60% posted receipts, a few overpaid, one voided */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference, BankTransferReference,
    VoidedAtUtc, VoidReason, VoidedBy, VerifiedAtUtc, VerifiedBy
)
SELECT
    b.Id, 'RCPT-T-' + RIGHT('000000' + CAST(i AS varchar(6)), 6),
    'ArrivalPayment',
    CASE WHEN i % 4 = 0 THEN 'EWallet' ELSE 'Cash' END,
    CASE WHEN i IN (10, 20, 30) THEN ROUND(b.TotalAmount * 1.2, 2) ELSE b.TotalAmount END,
    b.TotalAmount,
    CASE WHEN i IN (10, 20, 30) THEN ROUND(b.TotalAmount * -0.2, 2) ELSE 0 END,
    DATEADD(hour, -2, b.ArchivedAtUtc), 'Stress Seed', NULL,
    CASE WHEN i = 40 THEN 'Voided' ELSE 'Posted' END,
    NULL, NULL,
    CASE WHEN i = 40 THEN DATEADD(hour, -1, b.ArchivedAtUtc) ELSE NULL END,
    CASE WHEN i = 40 THEN 'Test void — wrong amount entered at desk' ELSE NULL END,
    CASE WHEN i = 40 THEN 'Stress Seed' ELSE NULL END,
    CASE WHEN i % 4 = 0 AND i <> 40 THEN DATEADD(hour, -1, b.ArchivedAtUtc) ELSE NULL END,
    CASE WHEN i % 4 = 0 AND i <> 40 THEN 'Stress Seed' ELSE NULL END
FROM Booking b
CROSS APPLY (SELECT CAST(RIGHT(b.Reference, 6) AS int) AS i) x
WHERE b.Reference LIKE 'TST-%' AND b.Status = 'CheckedOut' AND i % 5 IN (0, 1, 3);

/* active confirmed: half fully paid (assignable), half deposit-only */
INSERT INTO PaymentRecord (
    BookingId, ReceiptNumber, EventType, Method, Amount,
    StayTotalAtPosting, BalanceAfter, PaidAtUtc, ReceivedBy,
    Notes, Status, ExternalReference, BankTransferReference,
    VoidedAtUtc, VoidReason, VoidedBy, VerifiedAtUtc, VerifiedBy
)
SELECT
    b.Id, 'RCPT-A-' + RIGHT('000000' + CAST(i AS varchar(6)), 6),
    'ArrivalPayment',
    CASE WHEN i IN (562, 563, 645, 646) THEN 'EWallet' ELSE 'Cash' END,
    CASE WHEN i % 2 = 0 THEN b.TotalAmount ELSE b.AmountDueNow END,
    b.TotalAmount,
    CASE WHEN i % 2 = 0 THEN 0 ELSE ROUND(b.TotalAmount - b.AmountDueNow, 2) END,
    DATEADD(hour, -(i % 40), @nowUtc), 'Stress Seed', NULL, 'Posted',
    CASE WHEN i IN (562, 563, 645, 646) THEN 'TEST-EPAY-' + CAST(i AS varchar(6)) ELSE NULL END,
    NULL, NULL, NULL, NULL,
    /* two e-wallet receipts left unverified → verification badge */
    CASE WHEN i IN (562, 645) THEN NULL
         WHEN i IN (563, 646) THEN DATEADD(hour, -1, @nowUtc) ELSE NULL END,
    CASE WHEN i IN (563, 646) THEN 'Stress Seed' ELSE NULL END
FROM Booking b
CROSS APPLY (SELECT CAST(RIGHT(b.Reference, 6) AS int) AS i) x
WHERE b.Reference LIKE 'TST-%' AND b.Status = 'Confirmed';

/* ---- stay reviews on checked-out stress stays --------------------------- */
INSERT INTO StayReview (
    BookingId, GuestUserId, DisplayName, OverallRating, StaffRating,
    ComfortRating, FacilitiesRating, WouldRecommend, Comment, TagsJson,
    IsPublished, CreatedAtUtc, UpdatedAtUtc,
    HotelReply, HotelReplyAtUtc, HotelReplyBy,
    DeletedAtUtc, DeletedReason, DeletedNote, DeletedBy
)
SELECT
    b.Id, 'gst-' + RIGHT('000000' + CAST(i AS varchar(6)), 6),
    LEFT(b.GuestName, 80),
    1 + (i * 7) % 5, 1 + (i * 5) % 5, 1 + (i * 3) % 5, 1 + (i * 11) % 5,
    CASE WHEN (i * 7) % 5 >= 2 THEN 1 ELSE 0 END,
    CASE
        WHEN i = 11 THEN REPLICATE(N'This is an extremely long stress-test review. ', 30)
        WHEN i % 6 = 0 THEN N'Great stay, staff were very accommodating.'
        WHEN i % 6 = 1 THEN N'Room was clean but the aircon was noisy at night.'
        WHEN i % 6 = 2 THEN N'Average experience. Breakfast could be better.'
        WHEN i % 6 = 3 THEN N'Loved the view! Will definitely book again.'
        WHEN i % 6 = 4 THEN N'Check-in took a while but the room was worth it.'
        ELSE N'Decent hotel for the price. Nothing special but no complaints.'
    END,
    CASE i % 4
        WHEN 0 THEN '["Clean","Friendly staff"]'
        WHEN 1 THEN '["Quiet","Good location"]'
        WHEN 2 THEN '["Value for money"]'
        ELSE NULL END,
    CASE WHEN i % 8 = 0 THEN 0 ELSE 1 END,                       /* ~12% hidden */
    DATEADD(day, 1 + i % 5, b.ArchivedAtUtc),
    DATEADD(day, 1 + i % 5, b.ArchivedAtUtc),
    CASE WHEN i % 5 = 0 THEN N'Thank you for staying with Mori International Hotel!' ELSE NULL END,
    CASE WHEN i % 5 = 0 THEN DATEADD(day, 3 + i % 5, b.ArchivedAtUtc) ELSE NULL END,
    CASE WHEN i % 5 = 0 THEN 'Stress Seed' ELSE NULL END,
    CASE WHEN i IN (56, 156, 256) THEN DATEADD(day, 6, b.ArchivedAtUtc) ELSE NULL END,  /* soft-deleted */
    CASE WHEN i IN (56, 156, 256) THEN 'Spam' ELSE NULL END,
    CASE WHEN i IN (56, 156, 256) THEN 'Stress seed: spam/fake review demo' ELSE NULL END,
    CASE WHEN i IN (56, 156, 256) THEN 'Stress Seed' ELSE NULL END
FROM Booking b
CROSS APPLY (SELECT CAST(RIGHT(b.Reference, 6) AS int) AS i) x
WHERE b.Reference LIKE 'TST-%' AND b.Status = 'CheckedOut' AND i % 2 = 0;

/* ---- audit trail flood (~2,000 rows over 90 days) ------------------------ */
WITH n AS (
    SELECT TOP (2000) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS i
    FROM master.dbo.spt_values a CROSS JOIN master.dbo.spt_values b
)
INSERT INTO SystemAuditLog (
    AtUtc, Intent, Domain, Action,
    ActorUserId, ActorDisplayName, TargetType, TargetId, TargetLabel,
    Reason, Summary
)
SELECT
    DATEADD(minute, -(i % 129600), @nowUtc),                        /* past ~90 days */
    CASE i % 3 WHEN 0 THEN 'AdministrativeAction'
               WHEN 1 THEN 'ConfigurationChange' ELSE 'FileModification' END,
    CASE i % 8 WHEN 0 THEN 'Payment' WHEN 1 THEN 'Account' WHEN 2 THEN 'Booking'
               WHEN 3 THEN 'SpecialOffer' WHEN 4 THEN 'Configuration'
               WHEN 5 THEN 'File' WHEN 6 THEN 'Shift' ELSE 'Review' END,
    CASE i % 8
        WHEN 0 THEN CASE i % 4 WHEN 0 THEN 'Payment.Posted' WHEN 1 THEN 'Payment.Verified'
                             WHEN 2 THEN 'Payment.Refund' ELSE 'Payment.RefundPosted' END
        WHEN 1 THEN CASE i % 5 WHEN 0 THEN 'Account.Login' WHEN 1 THEN 'Account.LoginFailed'
                             WHEN 2 THEN 'Account.UserCreated' WHEN 3 THEN 'Account.PasswordReset'
                             ELSE 'Account.Disabled' END
        WHEN 2 THEN CASE i % 4 WHEN 0 THEN 'Booking.Created' WHEN 1 THEN 'Booking.Confirmed'
                             WHEN 2 THEN 'Booking.Updated' ELSE 'Booking.Cancelled' END
        WHEN 3 THEN CASE i % 2 WHEN 0 THEN 'SpecialOffer.Created' ELSE 'SpecialOffer.Updated' END
        WHEN 4 THEN 'Configuration.Updated'
        WHEN 5 THEN CASE i % 2 WHEN 0 THEN 'Booking.FlushExport' ELSE 'Payments.FlushExport' END
        WHEN 6 THEN 'Shift.Handover'
        ELSE CASE i % 3 WHEN 0 THEN 'Review.Published' WHEN 1 THEN 'Review.Replied'
                      ELSE 'StayReview.Deleted' END
    END,
    'seed-' + CAST(1 + i % 5 AS varchar(1)),
    CASE i % 5 WHEN 0 THEN 'Night Auditor' WHEN 1 THEN 'Front Desk A'
               WHEN 2 THEN 'Front Desk B' WHEN 3 THEN 'Admin Manager' ELSE 'System' END,
    CASE i % 8 WHEN 0 THEN 'Payment' WHEN 1 THEN 'Account' WHEN 2 THEN 'Booking'
               WHEN 3 THEN 'SpecialOffer' WHEN 4 THEN 'Setting' WHEN 5 THEN 'Export'
               WHEN 6 THEN 'Shift' ELSE 'StayReview' END,
    ISNULL(CAST(b.Id AS varchar(12)), CAST(i AS varchar(12))),
    ISNULL(b.Reference, 'TST-TARGET-' + CAST(i AS varchar(12))),
    CASE WHEN i % 9 = 0 THEN 'Stress-test reason: audit trail volume' ELSE NULL END,
    CASE i % 8
        WHEN 0 THEN 'Payment activity on ' + ISNULL(b.Reference, 'booking') + ' · ₱' + CAST(1000 + i AS varchar(10)) + '.'
        WHEN 1 THEN CASE WHEN i % 5 = 1 THEN 'Failed sign-in attempt (wrong password).'
                         ELSE 'Account event recorded for audit trail.' END
        WHEN 2 THEN 'Booking ' + ISNULL(b.Reference, '') + ' lifecycle event.'
        WHEN 3 THEN 'Special offer configuration changed.'
        WHEN 4 THEN 'System setting updated by staff.'
        WHEN 5 THEN 'History export generated and archived.'
        WHEN 6 THEN 'Shift handover notes logged.'
        ELSE 'Review moderation action.'
    END
FROM n
OUTER APPLY (
    SELECT TOP 1 bb.Id, bb.Reference
    FROM Booking bb
    WHERE bb.Reference LIKE 'TST-%'
    ORDER BY (bb.Id * 37 + i * 101) % 997          /* deterministic scatter */
) b;

/* ---- flush logs ---------------------------------------------------------- */
INSERT INTO SystemFlushLog (Kind, FlushedAtUtc, PerformedBy, RecordCount, FileName, Summary)
VALUES
 ('BookingHistory', DATEADD(day, -30, @nowUtc), 'Stress Seed', 120, 'Mori-History-Export-20260822-1500.pdf',
  'Checked out: 100 · Cancelled: 12 · Other: 8 — Stay range: Jan–Aug 2026 (PH) — Cleared after export.'),
 ('Payments', DATEADD(day, -20, @nowUtc), 'Stress Seed', 85, 'Mori-Payments-Export-20260901-0900.pdf',
  '85 payment records exported — Cleared after export.'),
 ('StaffAudit', DATEADD(day, -12, @nowUtc), 'Stress Seed', 340, 'Mori-StaffAudit-Export-20260909-1800.pdf',
  '340 account-domain audit rows exported — Cleared after export.'),
 ('BookingHistory', DATEADD(day, -5, @nowUtc), 'Stress Seed', 64, 'Mori-History-Export-20260916-1400.pdf',
  'Checked out: 60 · Cancelled: 4 — Export only — records kept.');

COMMIT;

/* ---- report -------------------------------------------------------------- */
SELECT 'Booking' AS [Table], b.Status AS [Key], COUNT(*) AS [Count] FROM Booking b
    WHERE b.Reference LIKE 'TST-%' GROUP BY b.Status
UNION ALL SELECT 'RoomType', Name, 1 FROM RoomType WHERE Name LIKE 'ST-%'
UNION ALL SELECT 'Room', Status, COUNT(*) FROM Room r JOIN RoomType rt ON r.RoomTypeId = rt.RoomTypeId
    WHERE rt.Name LIKE 'ST-%' GROUP BY Status
UNION ALL SELECT 'StayReview', 'total', COUNT(*) FROM StayReview WHERE GuestUserId LIKE 'gst-%'
UNION ALL SELECT 'StayReview', 'published', COUNT(*) FROM StayReview WHERE GuestUserId LIKE 'gst-%' AND IsPublished = 1
UNION ALL SELECT 'StayReview', 'withReply', COUNT(*) FROM StayReview WHERE GuestUserId LIKE 'gst-%' AND HotelReply IS NOT NULL
UNION ALL SELECT 'StayReview', 'softDeleted', COUNT(*) FROM StayReview WHERE GuestUserId LIKE 'gst-%' AND DeletedAtUtc IS NOT NULL
UNION ALL SELECT 'SystemAuditLog', 'seeded', COUNT(*) FROM SystemAuditLog WHERE ActorUserId LIKE 'seed-%'
UNION ALL SELECT 'SystemAuditLog', 'accountDomain', COUNT(*) FROM SystemAuditLog WHERE ActorUserId LIKE 'seed-%' AND Domain = 'Account'
UNION ALL SELECT 'PaymentRecord', 'seeded', COUNT(*) FROM PaymentRecord p JOIN Booking b ON p.BookingId = b.Id WHERE b.Reference LIKE 'TST-%'
UNION ALL SELECT 'SpecialOffer', 'seeded', COUNT(*) FROM SpecialOffer WHERE Title LIKE 'ST-%'
UNION ALL SELECT 'SystemFlushLog', 'seeded', COUNT(*) FROM SystemFlushLog WHERE PerformedBy = 'Stress Seed'
ORDER BY [Table], [Key];
