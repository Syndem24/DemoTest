"""Generate docs/HotelDb-Schema.docx from the current HotelDb schema guide."""
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

NAVY = RGBColor(0x0B, 0x1F, 0x3A)
TEAL = RGBColor(0x0D, 0x94, 0x88)
OUT = Path(__file__).resolve().parent / "HotelDb-Schema.docx"
OUT_FALLBACK = Path(__file__).resolve().parent / "HotelDb-Schema-updated.docx"


def set_run_font(run, size=11, bold=False, color=NAVY):
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Calibri")
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color


def add_heading(doc, text, level):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        set_run_font(run, size=18 if level == 1 else 14 if level == 2 else 12, bold=True, color=NAVY)
    return p


def add_body(doc, text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_font(run)
    p.paragraph_format.space_after = Pt(6)
    return p


def shade_header_row(table):
    for cell in table.rows[0].cells:
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:fill"), "E6F7F7")
        shd.set(qn("w:val"), "clear")
        tc_pr.append(shd)


def add_grid(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, h in enumerate(headers):
        table.rows[0].cells[i].text = ""
        run = table.rows[0].cells[i].paragraphs[0].add_run(h)
        set_run_font(run, size=9, bold=True)
    shade_header_row(table)
    for r, row in enumerate(rows, start=1):
        for c, val in enumerate(row):
            table.rows[r].cells[c].text = ""
            run = table.rows[r].cells[c].paragraphs[0].add_run(val)
            set_run_font(run, size=9, bold=(c == 0))
    doc.add_paragraph()


def entity(doc, name, er_type, purpose, attrs, relationships):
    add_heading(doc, f"{name} — {er_type}", 2)
    add_body(doc, purpose)
    add_body(doc, f"Relationships: {relationships}")
    add_heading(doc, "Attributes", 3)
    add_grid(doc, ["Attribute", "What it is for"], attrs)


def main():
    doc = Document()
    section = doc.sections[0]
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)

    title = doc.add_paragraph()
    run = title.add_run("Mori International Hotel")
    set_run_font(run, size=22, bold=True, color=NAVY)

    sub = doc.add_paragraph()
    run = sub.add_run("HotelDb schema")
    set_run_font(run, size=16, bold=True, color=TEAL)

    add_body(
        doc,
        "Guide to the live SQL Server database (HotelBookingDbContext). "
        "Dates are stored in UTC; the app shows Philippines time. "
        "Markdown source: docs/HotelDb-Schema.md.",
    )

    add_heading(doc, "Entity type legend", 1)
    add_grid(
        doc,
        ["Type", "Meaning"],
        [
            ("Strong", "Own primary key; independent identity."),
            ("Weak / dependent", "Surrogate key; lifecycle owned by a parent (often cascade)."),
            ("Associative", "Bridge resolving many-to-many / assignment."),
            ("Identity satellite", "ASP.NET Identity support table (composite key)."),
        ],
    )

    add_heading(doc, "Master list", 1)
    add_grid(
        doc,
        ["Table", "ER type", "PK", "Relationships"],
        [
            ("RoomType", "Strong", "RoomTypeId", "1→N Room, SpecialOffer; optional BookingItem"),
            ("Room", "Strong", "Id", "N→1 RoomType; used by BookingRoomAssignment"),
            ("Booking", "Strong", "Id", "opt→SpecialOffer; 1→N Item/Charge/Payment; 1→0..1 StayReview"),
            ("BookingItem", "Weak / dependent", "Id", "N→1 Booking; opt→RoomType; 1→N Assignment"),
            ("BookingRoomAssignment", "Associative", "Id", "BookingItem ↔ Room; unique pair"),
            ("BookingCharge", "Weak / dependent", "Id", "N→1 Booking"),
            ("PaymentRecord", "Weak / dependent", "Id", "N→1 Booking"),
            ("SpecialOffer", "Strong", "Id", "N→1 RoomType; optional Booking"),
            ("StayReview", "Weak / dependent", "Id", "N→1 Booking; unique BookingId"),
            ("StaffRole", "Strong", "Id", "1→N StaffUser"),
            ("StaffUser", "Strong", "Id", "N→1 StaffRole; logins/tokens/reset"),
            ("StaffExternalLogin", "Identity satellite", "Provider+Key", "N→1 StaffUser"),
            ("StaffAuthToken", "Identity satellite", "User+Provider+Name", "N→1 StaffUser"),
            ("StaffPasswordResetCode", "Weak / dependent", "Id", "→ StaffUser (UserId)"),
            ("SecureSetting", "Strong", "Id", "Standalone vault"),
            ("SystemAuditLog", "Strong", "Id", "Append-only; no FK"),
            ("SystemFlushLog", "Strong", "Id", "Export metadata"),
        ],
    )

    add_heading(doc, "Relationship overview", 1)
    add_body(
        doc,
        "RoomType has many Rooms and SpecialOffers. "
        "Booking has Items, Charges, Payments, and optional StayReview. "
        "BookingItem assigns Rooms through BookingRoomAssignment (associative). "
        "StaffUser has one StaffRole via RoleId.",
    )

    add_heading(doc, "1. Inventory", 1)
    entity(
        doc,
        "RoomType",
        "Strong",
        "Sellable room category (name, rate, photos, occupancy). Door numbers live in Room.",
        [
            ("RoomTypeId", "Primary key."),
            ("Name", "Unique display name."),
            ("Description", "Guest-facing text."),
            ("CreatedAt", "Created (UTC)."),
            ("Inclusions", "Amenities JSON list."),
            ("Images", "Photo paths JSON."),
            ("PricePerNight", "Standard nightly rate."),
            ("MaxOccupancy", "Max guests."),
            ("BedCount", "Beds."),
        ],
        "1→N Room; 1→N SpecialOffer; optional parent of BookingItem.RoomTypeId.",
    )
    entity(
        doc,
        "Room",
        "Strong",
        "One physical guest room (door number).",
        [
            ("Id", "Primary key."),
            ("RoomTypeId", "FK → RoomType."),
            ("RoomNumber", "Unique door number."),
            ("Status", "Available, Unavailable, Occupied, Cleaning (UI: Maintaining)."),
        ],
        "N→1 RoomType; referenced by BookingRoomAssignment.",
    )

    add_heading(doc, "2. Guest stays", 1)
    entity(
        doc,
        "Booking",
        "Strong",
        "One guest stay (online, walk-in, or OTA).",
        [
            ("Id", "Primary key."),
            ("Reference", "Unique confirmation code."),
            ("GuestName / GuestEmail / GuestPhone", "Guest contact."),
            ("CheckInAtUtc / CheckoutTimeUtc", "Stay window (UTC)."),
            ("Kind", "Booking or Reservation."),
            ("PaymentOption", "Full or Half."),
            ("Status", "Pending, Confirmed, Rejected, Cancelled, CheckedOut."),
            ("Channel", "Online, WalkIn, FrontDeskExtension, OTAs, Other."),
            ("ArrivalDiscountRequest", "None / SeniorCitizen / Pwd."),
            ("CashOnlyPromo", "Cash-only stay."),
            ("SpecialOfferId", "Optional promo FK."),
            ("TotalAmount / AmountDueNow", "Money totals."),
            ("AdultCount / ChildCount / GuestPartyJson", "Party size."),
            ("CreatedAtUtc / UpdatedAtUtc", "Timestamps."),
            ("IsArchived / ArchivedAtUtc", "History flag."),
            ("IsNotificationCleared", "Admin bell hide."),
            ("ArrivalWarningSentAtUtc / PendingCallWarningSentAtUtc / CheckoutWarningSentAtUtc", "Warning stamps."),
        ],
        "opt→SpecialOffer; 1→N BookingItem, BookingCharge, PaymentRecord; 1→0..1 StayReview.",
    )
    entity(
        doc,
        "BookingItem",
        "Weak / dependent",
        "Room-type line on a stay (qty × nightly rate).",
        [
            ("Id", "Primary key."),
            ("BookingId", "FK → Booking (cascade)."),
            ("RoomTypeId", "Optional FK → RoomType."),
            ("RoomTypeName", "Name snapshot."),
            ("Quantity", "Room count."),
            ("PricePerNight", "Line rate."),
        ],
        "N→1 Booking; optional N→1 RoomType; 1→N BookingRoomAssignment. Unique (BookingId, RoomTypeId).",
    )
    entity(
        doc,
        "BookingRoomAssignment",
        "Associative",
        "Assigns a physical Room to a BookingItem line.",
        [
            ("Id", "Primary key."),
            ("BookingItemId", "FK → BookingItem (cascade)."),
            ("RoomId", "FK → Room (restrict)."),
        ],
        "Bridges BookingItem ↔ Room. Unique (BookingItemId, RoomId).",
    )
    entity(
        doc,
        "BookingCharge",
        "Weak / dependent",
        "Extra fees on a stay.",
        [
            ("Id", "Primary key."),
            ("BookingId", "FK → Booking (cascade)."),
            ("ChargeType", "EarlyCheckIn, LateCheckout, ExtraPerson, Incidental, ServiceFee, SnackBeverage, StayExtension."),
            ("Label / Quantity / Nights / UnitAmount / Amount", "Bill line fields."),
            ("CreatedAtUtc", "When added."),
        ],
        "N→1 Booking.",
    )
    entity(
        doc,
        "StayReview",
        "Weak / dependent",
        "Guest review for one stay (unique BookingId).",
        [
            ("Id", "Primary key."),
            ("BookingId", "FK → Booking (cascade), unique."),
            ("GuestUserId / DisplayName", "Guest identity."),
            ("OverallRating / StaffRating / ComfortRating / FacilitiesRating", "Scores."),
            ("WouldRecommend / Comment / TagsJson", "Feedback."),
            ("IsPublished", "Public visibility."),
            ("HotelReply / HotelReplyAtUtc / HotelReplyBy", "Hotel response."),
            ("CreatedAtUtc / UpdatedAtUtc", "Timestamps."),
        ],
        "N→1 Booking (1:1 enforced).",
    )

    add_heading(doc, "3. Money", 1)
    entity(
        doc,
        "PaymentRecord",
        "Weak / dependent",
        "Posted or voided payment against a stay.",
        [
            ("Id", "Primary key."),
            ("BookingId", "FK → Booking (cascade)."),
            ("ReceiptNumber", "Unique receipt code."),
            ("EventType / Method / Status", "Deposit…; Cash/EWallet/…; Posted/Voided."),
            ("Amount / StayTotalAtPosting / BalanceAfter", "Money fields."),
            ("PaidAtUtc / ReceivedBy / Notes", "Posting metadata."),
            ("ExternalReference / BankTransferReference / ReceiptImagePath", "Transfer + image."),
            ("VoidedAtUtc / VoidReason / VoidedBy", "Void fields."),
        ],
        "N→1 Booking.",
    )

    add_heading(doc, "4. Promos", 1)
    entity(
        doc,
        "SpecialOffer",
        "Strong",
        "Promo rate for one room type.",
        [
            ("Id", "Primary key."),
            ("RoomTypeId", "FK → RoomType (cascade)."),
            ("Kind / Title / Description", "Campaign."),
            ("RegularPricePerNight / PromoPricePerNight / MinNights", "Pricing."),
            ("Channels / CashOnly / IsActive / LoyaltyApplyMode", "Rules."),
            ("StartsAtUtc / EndsAtUtc / OpenEnded / SortOrder", "Schedule."),
            ("CreatedAtUtc / UpdatedAtUtc", "Timestamps."),
        ],
        "N→1 RoomType; optional Booking.SpecialOfferId.",
    )

    add_heading(doc, "5. Staff / auth", 1)
    add_body(
        doc,
        "Tables: StaffUser, StaffRole, StaffExternalLogin, StaffAuthToken, StaffPasswordResetCode "
        "(see StaffAuthSchema).",
    )
    entity(
        doc,
        "StaffRole",
        "Strong",
        "Admin roles (AdminManager, Receptionist, reserved Guest).",
        [
            ("Id", "Primary key (string)."),
            ("Name / NormalizedName", "Role name."),
            ("ConcurrencyStamp", "Concurrency token."),
        ],
        "1→N StaffUser.",
    )
    entity(
        doc,
        "StaffUser",
        "Strong",
        "Staff login profile (ApplicationUser / Identity).",
        [
            ("Id", "Primary key (string)."),
            ("UserName / Email / PasswordHash / …", "Identity columns."),
            ("FullName / BirthDate / Address", "Profile."),
            ("MustChangePassword", "Force password change."),
            ("RoleId", "FK → StaffRole."),
            ("GoogleEmail / NormalizedGoogleEmail / GoogleVerificationStatus", "Google recovery."),
            ("DashboardLayoutJson", "Dashboard layout."),
        ],
        "N→1 StaffRole; 1→N logins, tokens, reset codes; shifts by StaffUserId.",
    )
    entity(
        doc,
        "StaffExternalLogin",
        "Identity satellite",
        "External login link (e.g. Google).",
        [
            ("LoginProvider + ProviderKey", "Composite PK."),
            ("ProviderDisplayName", "Label."),
            ("UserId", "FK → StaffUser."),
        ],
        "N→1 StaffUser.",
    )
    entity(
        doc,
        "StaffAuthToken",
        "Identity satellite",
        "Auth tokens for a staff user.",
        [
            ("UserId + LoginProvider + Name", "Composite PK."),
            ("Value", "Token value."),
        ],
        "N→1 StaffUser.",
    )
    entity(
        doc,
        "StaffPasswordResetCode",
        "Weak / dependent",
        "OTP / reset codes for staff password recovery.",
        [
            ("Id", "Primary key."),
            ("UserId / NormalizedEmail / CodeHash", "Target + hash."),
            ("CreatedAtUtc / ExpiresAtUtc / ConsumedAtUtc / FailedAttempts", "Lifecycle."),
        ],
        "Logically N→1 StaffUser.",
    )

    add_heading(doc, "6. Settings, audit, export", 1)
    entity(
        doc,
        "SecureSetting",
        "Strong",
        "Encrypted vault for SMTP, Gemini, Groq, Google OAuth, etc.",
        [
            ("Id", "Primary key."),
            ("Key", "Unique key."),
            ("Ciphertext", "Encrypted value."),
            ("UpdatedUtc", "Last update."),
        ],
        "Standalone.",
    )
    entity(
        doc,
        "SystemAuditLog",
        "Strong",
        "Append-only operational audit trail (not deleted by flush).",
        [
            ("Id", "Primary key (long)."),
            ("AtUtc / Intent / Domain / Action", "What happened."),
            ("ActorUserId / ActorDisplayName", "Who."),
            ("TargetType / TargetId / TargetLabel", "What."),
            ("Reason / Summary", "Details."),
        ],
        "Standalone (string actor ids).",
    )
    entity(
        doc,
        "SystemFlushLog",
        "Strong",
        "Metadata after retention export actions (~7-day app retention).",
        [
            ("Id", "Primary key."),
            ("Kind", "BookingHistory, Payments, StaffAudit."),
            ("FlushedAtUtc / PerformedBy / RecordCount / FileName / Summary", "Export metadata."),
        ],
        "Standalone.",
    )

    add_heading(doc, "7. EF helper", 1)
    entity(
        doc,
        "__EFMigrationsHistory",
        "Strong (tooling)",
        "EF list of applied schema updates. Not hotel data.",
        [
            ("MigrationId", "Applied migration name."),
            ("ProductVersion", "EF version."),
        ],
        "None.",
    )

    add_heading(doc, "Renames / removals", 1)
    add_grid(
        doc,
        ["Old / wrong", "Current"],
        [
            ("StaffAccount table name", "StaffUser"),
            ("StaffAccountLogin / Token", "StaffExternalLogin / StaffAuthToken"),
            ("StaffAccountRole / Claims", "Dropped; use StaffUser.RoleId"),
            ("StaffAccountAudit", "SystemAuditLog (Account domain)"),
        ],
    )

    add_heading(doc, "Code map", 1)
    add_body(doc, "Models: TestingDemo/Models/. Context: TestingDemo/Data/HotelBookingDbContext.cs.")
    add_grid(
        doc,
        ["Table", "C# type"],
        [
            ("RoomType", "RoomType"),
            ("Room", "Room"),
            ("Booking", "Booking"),
            ("BookingItem", "BookingItem"),
            ("BookingRoomAssignment", "BookingRoomAssignment"),
            ("BookingCharge", "BookingCharge"),
            ("PaymentRecord", "PaymentRecord"),
            ("SpecialOffer", "SpecialOffer"),
            ("StayReview", "StayReview"),
            ("StaffUser", "ApplicationUser"),
            ("StaffRole", "IdentityRole"),
            ("StaffExternalLogin", "Identity user login"),
            ("StaffAuthToken", "Identity user token"),
            ("StaffPasswordResetCode", "StaffPasswordResetCode"),
            ("SecureSetting", "SecureSetting"),
            ("SystemAuditLog", "SystemAuditLog"),
            ("SystemFlushLog", "SystemFlushLog"),
        ],
    )

    target = OUT
    try:
        doc.save(target)
    except PermissionError:
        target = OUT_FALLBACK
        doc.save(target)
        print(f"Primary docx locked; wrote {target}")
        print("Close Word and re-run to overwrite HotelDb-Schema.docx.")
        return
    print(f"Wrote {target}")


if __name__ == "__main__":
    main()
