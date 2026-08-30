"""Generate docs/HotelDb-Schema.docx from the analyzed HotelDb schema."""
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

NAVY = RGBColor(0x0B, 0x1F, 0x3A)
TEAL = RGBColor(0x0D, 0x94, 0x88)
OUT = Path(__file__).resolve().parent / "HotelDb-Schema.docx"


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
    p.paragraph_format.space_after = Pt(8)
    return p


def add_table(doc, rows):
    table = doc.add_table(rows=len(rows), cols=2)
    table.style = "Table Grid"
    table.autofit = True
    for i, (left, right) in enumerate(rows):
        c0, c1 = table.rows[i].cells
        c0.text = ""
        c1.text = ""
        r0 = c0.paragraphs[0].add_run(left)
        r1 = c1.paragraphs[0].add_run(right)
        set_run_font(r0, size=10, bold=(i == 0), color=NAVY)
        set_run_font(r1, size=10, bold=(i == 0), color=NAVY)
        if i == 0:
            for cell in table.rows[0].cells:
                shading = cell._tePr if False else cell._tc.get_or_add_tcPr()
                fill = shading.makeelement(
                    qn("w:shd"),
                    {qn("w:fill"): "E6F7F7", qn("w:val"): "clear"},
                )
                shading.append(fill)
    doc.add_paragraph()


def shade_header_row(table):
    from docx.oxml import OxmlElement

    for cell in table.rows[0].cells:
        tc_pr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement("w:shd")
        shd.set(qn("w:fill"), "E6F7F7")
        shd.set(qn("w:val"), "clear")
        tc_pr.append(shd)


def entity(doc, name, purpose, attrs):
    add_heading(doc, name, 2)
    add_body(doc, purpose)
    add_heading(doc, "Attributes", 3)
    table = doc.add_table(rows=1 + len(attrs), cols=2)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    hdr[0].text = ""
    hdr[1].text = ""
    h0 = hdr[0].paragraphs[0].add_run("Attribute")
    h1 = hdr[1].paragraphs[0].add_run("What it is for")
    set_run_font(h0, size=10, bold=True)
    set_run_font(h1, size=10, bold=True)
    shade_header_row(table)
    for i, (col, meaning) in enumerate(attrs, start=1):
        table.rows[i].cells[0].text = ""
        table.rows[i].cells[1].text = ""
        r0 = table.rows[i].cells[0].paragraphs[0].add_run(col)
        r1 = table.rows[i].cells[1].paragraphs[0].add_run(meaning)
        set_run_font(r0, size=10, bold=True)
        set_run_font(r1, size=10)
    doc.add_paragraph()


def main():
    doc = Document()
    section = doc.sections[0]
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = title.add_run("Mori International Hotel")
    set_run_font(run, size=22, bold=True, color=NAVY)

    sub = doc.add_paragraph()
    run = sub.add_run("HotelDb schema")
    set_run_font(run, size=16, bold=True, color=TEAL)

    add_body(
        doc,
        "Simple guide to the live SQL Server database (HotelDb.mdf). "
        "Dates are stored in UTC. The app shows them in Philippines time. "
        "A Markdown copy of this guide is docs/HotelDb-Schema.md.",
    )

    add_heading(doc, "How the hotel data fits together", 1)
    for line in [
        "1. RoomType = a category you sell (Queen, Twin).",
        "2. Room = one physical door (101, 102) of that type.",
        "3. Booking = one guest stay.",
        "4. BookingItem = how many of each room type are on that stay.",
        "5. BookingRoomAssignment = which door number was given to the guest.",
        "6. BookingCharge = extra fees (early check-in, extra person, snacks).",
        "7. PaymentRecord = money received or voided for that stay.",
        "8. SpecialOffer = a promo price on one room type.",
        "9. StaffAccount + StaffRole = who can log in to admin.",
        "10. SystemFlushLog = audit of export PDF then delete old records.",
    ]:
        add_body(doc, line)

    add_body(
        doc,
        "RoomType has many Rooms and SpecialOffers. "
        "A Booking has BookingItems, BookingCharges, and PaymentRecords. "
        "A BookingItem has BookingRoomAssignments to Rooms. "
        "StaffAccount points at one StaffRole (RoleId).",
    )

    add_heading(doc, "1. Inventory", 1)
    entity(
        doc,
        "RoomType",
        "The sellable room category (name, nightly rate, photos, occupancy). Individual door numbers are not here; they live in Room.",
        [
            ("RoomTypeId", "Unique id for this category."),
            ("Name", "Display name, e.g. Queen Room. Must be unique."),
            ("Description", "Longer text shown to guests."),
            ("CreatedAt", "When this type was created (UTC)."),
            ("Inclusions", "Amenities list stored as JSON (wifi, breakfast, …)."),
            ("Images", "Photo paths stored as JSON."),
            ("PricePerNight", "Standard nightly rate before any promo."),
            ("MaxOccupancy", "How many guests this type can hold."),
            ("BedCount", "How many beds."),
        ],
    )
    entity(
        doc,
        "Room",
        "One physical guest room (the door number staff assign at check-in).",
        [
            ("Id", "Unique id for this door."),
            ("RoomTypeId", "Which category this room belongs to (RoomType)."),
            ("RoomNumber", "Door number shown to staff, e.g. 101. Must be unique."),
            ("Status", "Available, Unavailable, Occupied, or Cleaning (shown as Maintaining)."),
        ],
    )

    add_heading(doc, "2. Guest stays", 1)
    entity(
        doc,
        "Booking",
        "One guest stay — online book, walk-in, or OTA. This is the main stay record.",
        [
            ("Id", "Unique id."),
            ("Reference", "Public confirmation code. Unique."),
            ("GuestName", "Guest full name."),
            ("GuestEmail", "Guest email."),
            ("GuestPhone", "Guest phone."),
            ("CheckInAtUtc", "Planned arrival (UTC)."),
            ("CheckoutTimeUtc", "Planned departure (UTC)."),
            ("Kind", "Booking (near arrival) or Reservation (further ahead)."),
            ("PaymentOption", "Full or Half due when they book."),
            ("Status", "Pending, Confirmed, Rejected, Cancelled, CheckedOut."),
            ("Channel", "Online, WalkIn, FrontDeskExtension, Agoda, Expedia, RedDoorz, OtherThirdParty."),
            ("ArrivalDiscountRequest", "None, SeniorCitizen, or Pwd — claimed at arrival."),
            ("CashOnlyPromo", "If true, this stay must be paid in cash."),
            ("SpecialOfferId", "Optional promo that was applied."),
            ("TotalAmount", "Stay total (rooms + fees)."),
            ("AmountDueNow", "How much was required at booking time."),
            ("CreatedAtUtc", "When the stay was created."),
            ("UpdatedAtUtc", "Last change."),
            ("IsArchived", "True when moved to admin history (not deleted)."),
            ("ArchivedAtUtc", "When it was archived."),
            ("IsNotificationCleared", "Hidden from the admin bell until something new happens."),
            ("ArrivalWarningSentAtUtc", "Set when the arriving-soon warning was shown."),
            ("PendingCallWarningSentAtUtc", "Set when the call-pending-guest warning was shown."),
            ("CheckoutWarningSentAtUtc", "Set when the checkout-soon warning was shown."),
        ],
    )
    entity(
        doc,
        "BookingItem",
        "One line on the stay: how many of a room type at this nightly rate. Physical room numbers are assigned later.",
        [
            ("Id", "Unique id."),
            ("BookingId", "Which stay this line belongs to."),
            ("RoomTypeId", "Room category. Can be empty if that type was later removed."),
            ("RoomTypeName", "Name copied at booking time so history still makes sense."),
            ("Quantity", "How many rooms of this type."),
            ("PricePerNight", "Nightly rate used for this line (regular or promo)."),
        ],
    )
    entity(
        doc,
        "BookingRoomAssignment",
        "Links a real door (Room) to a stay line after reception assigns room numbers. This is not inventory.",
        [
            ("Id", "Unique id."),
            ("BookingItemId", "Which stay line this assignment belongs to."),
            ("RoomId", "Which physical room was given to the guest."),
        ],
    )
    entity(
        doc,
        "BookingCharge",
        "Extra money on the stay besides the nightly room rate.",
        [
            ("Id", "Unique id."),
            ("BookingId", "Which stay."),
            ("ChargeType", "EarlyCheckIn, LateCheckout, ExtraPerson, Incidental, ServiceFee, SnackBeverage, StayExtension."),
            ("Label", "Text shown on the bill."),
            ("Quantity", "Count: rooms, hours, or extra persons."),
            ("Nights", "Multiplier for extra-person fees; usually 1 otherwise."),
            ("UnitAmount", "Price per unit."),
            ("Amount", "Line total."),
            ("CreatedAtUtc", "When the fee was added."),
        ],
    )

    add_heading(doc, "3. Money", 1)
    entity(
        doc,
        "PaymentRecord",
        "Company log of money posted against a stay. Rows are not edited; a bad payment is voided.",
        [
            ("Id", "Unique id."),
            ("BookingId", "Which stay this payment belongs to."),
            ("ReceiptNumber", "Unique receipt code."),
            ("EventType", "Deposit, ArrivalPayment, BalanceSettlement, Refund, Adjustment."),
            ("Method", "Cash, EWallet, BankTransfer, or legacy Card / Maya / Other."),
            ("Amount", "Money amount."),
            ("StayTotalAtPosting", "Stay total at the moment this was posted."),
            ("BalanceAfter", "Remaining balance after this row."),
            ("PaidAtUtc", "When it was posted."),
            ("ReceivedBy", "Staff name who recorded it."),
            ("Notes", "Optional comment."),
            ("Status", "Posted or Voided."),
            ("ExternalReference", "E-wallet / InstaPay reference from the guest receipt."),
            ("BankTransferReference", "Bank / InstaPay clearing reference."),
            ("ReceiptImagePath", "Saved photo of a digital receipt."),
            ("VoidedAtUtc", "When it was voided (if ever)."),
            ("VoidReason", "Why it was voided."),
            ("VoidedBy", "Who voided it."),
        ],
    )

    add_heading(doc, "4. Promos", 1)
    entity(
        doc,
        "SpecialOffer",
        "A promo rate for one room type. The same campaign title can appear on several room types as sibling rows.",
        [
            ("Id", "Unique id."),
            ("RoomTypeId", "Which room type this promo applies to."),
            ("Kind", "LimitedTime or StayLongerSaveMore (older kinds exist but are not created anymore)."),
            ("Title", "Campaign name."),
            ("Description", "Optional details."),
            ("RegularPricePerNight", "Was / comparison price."),
            ("PromoPricePerNight", "Promo nightly rate."),
            ("MinNights", "Minimum nights for Stay Longer; empty for Limited Time."),
            ("Channels", "Where it shows: Online, Walk-in, Front desk, third-party (visibility only)."),
            ("CashOnly", "If true, the stay must be paid in cash."),
            ("IsActive", "Whether staff still treat it as on."),
            ("StartsAtUtc", "Promo start."),
            ("EndsAtUtc", "Promo end."),
            ("SortOrder", "Display order."),
            ("CreatedAtUtc", "Created."),
            ("UpdatedAtUtc", "Last edit."),
        ],
    )

    add_heading(doc, "5. Staff login", 1)
    add_body(
        doc,
        "Staff log in with StaffAccount. Job title is StaffRole, stored as StaffAccount.RoleId (one role per person). "
        "Google extras are StaffAccountLogin and StaffAccountToken. Who changed an account is StaffAccountAudit.",
    )
    entity(
        doc,
        "StaffRole",
        "Job titles used by admin security. Typical names: AdminManager, Receptionist (and a reserved Guest name).",
        [
            ("Id", "Unique id (text)."),
            ("Name", "Role name shown in the app."),
            ("NormalizedName", "Uppercase copy used for lookups."),
            ("ConcurrencyStamp", "Stops two people overwriting the role at the same time."),
        ],
    )
    entity(
        doc,
        "StaffAccount",
        "One staff login (username, password, profile). This is the real user table.",
        [
            ("Id", "Unique id (text)."),
            ("UserName", "Login name."),
            ("NormalizedUserName", "Uppercase copy for lookups."),
            ("Email", "Work email."),
            ("NormalizedEmail", "Uppercase copy for lookups."),
            ("EmailConfirmed", "Whether email was confirmed."),
            ("PasswordHash", "Encrypted password (never plain text)."),
            ("SecurityStamp", "Invalidates old cookies when the account changes."),
            ("ConcurrencyStamp", "Stops two edits colliding."),
            ("PhoneNumber", "Staff phone."),
            ("PhoneNumberConfirmed", "Whether phone was confirmed."),
            ("TwoFactorEnabled", "Reserved for 2FA."),
            ("LockoutEnd", "If set in the future, the account is locked until then."),
            ("LockoutEnabled", "Whether lockout is allowed."),
            ("AccessFailedCount", "Failed login attempts."),
            ("FullName", "Display name in admin."),
            ("BirthDate", "Date of birth."),
            ("Address", "Address."),
            ("MustChangePassword", "Force password change on next login (temp password)."),
            ("GoogleEmail", "Gmail used for verify / future 2FA."),
            ("NormalizedGoogleEmail", "Uppercase Gmail for unique lookup."),
            ("GoogleVerificationStatus", "NotLinked, PendingGoogleVerification, or GoogleVerified."),
            ("RoleId", "Which StaffRole this person has."),
        ],
    )
    entity(
        doc,
        "StaffAccountLogin",
        "External login link (Google). One row per provider key.",
        [
            ("LoginProvider", "Provider name, e.g. Google."),
            ("ProviderKey", "Id from that provider."),
            ("ProviderDisplayName", "Label for the provider."),
            ("UserId", "Which StaffAccount this belongs to."),
        ],
    )
    entity(
        doc,
        "StaffAccountToken",
        "Auth tokens for a staff account (verify email, 2FA, recovery).",
        [
            ("UserId", "Which staff account."),
            ("LoginProvider", "Token group / provider."),
            ("Name", "Token name."),
            ("Value", "Token value."),
        ],
    )
    entity(
        doc,
        "StaffAccountAudit",
        "Who created, edited, or disabled a staff account. Can be flushed from Flush logs.",
        [
            ("Id", "Unique id."),
            ("Action", "What happened (create, edit, disable, …)."),
            ("TargetUserId", "The staff account that was changed."),
            ("PerformedByUserId", "The staff account that did the change."),
            ("RoleAssigned", "Role at the time of the action."),
            ("AtUtc", "When it happened."),
        ],
    )

    add_heading(doc, "6. Records / flush", 1)
    entity(
        doc,
        "SystemFlushLog",
        "After staff export history or payments to PDF (or flush staff audit) and delete those rows, this table remembers who did it. Entries are kept about 7 days (expiry is calculated in code, not stored as a column).",
        [
            ("Id", "Unique id."),
            ("Kind", "BookingHistory, Payments, or StaffAudit."),
            ("FlushedAtUtc", "When the flush ran."),
            ("PerformedBy", "Staff name typed for the flush."),
            ("RecordCount", "How many rows were exported / deleted."),
            ("FileName", "PDF or zip file name if one was downloaded."),
            ("Summary", "Short description of what was flushed."),
        ],
    )

    add_heading(doc, "7. EF helper table", 1)
    entity(
        doc,
        "__EFMigrationsHistory",
        "Entity Framework’s list of schema updates already applied. Not hotel data. Do not edit by hand.",
        [
            ("MigrationId", "Name of a schema update that already ran."),
            ("ProductVersion", "EF version that applied it."),
        ],
    )

    add_heading(doc, "Tables removed on purpose", 1)
    add_body(doc, "These used to exist. They are not in HotelDb now.")
    gone = doc.add_table(rows=5, cols=2)
    gone.style = "Table Grid"
    gone.rows[0].cells[0].text = ""
    gone.rows[0].cells[1].text = ""
    a = gone.rows[0].cells[0].paragraphs[0].add_run("Old table")
    b = gone.rows[0].cells[1].paragraphs[0].add_run("Why it went away")
    set_run_font(a, size=10, bold=True)
    set_run_font(b, size=10, bold=True)
    shade_header_row(gone)
    removed = [
        ("StaffUser", "Unused leftover from before Identity login."),
        ("StaffAccountRole", "Role was merged onto StaffAccount.RoleId."),
        ("StaffAccountClaim", "Empty; not used."),
        ("StaffRoleClaim", "Empty; not used."),
    ]
    for i, (name, why) in enumerate(removed, start=1):
        gone.rows[i].cells[0].text = ""
        gone.rows[i].cells[1].text = ""
        r0 = gone.rows[i].cells[0].paragraphs[0].add_run(name)
        r1 = gone.rows[i].cells[1].paragraphs[0].add_run(why)
        set_run_font(r0, size=10, bold=True)
        set_run_font(r1, size=10)
    doc.add_paragraph()

    add_heading(doc, "Code map", 1)
    add_body(doc, "Models live under TestingDemo/Models/. Table names are set in TestingDemo/Data/HotelBookingDbContext.cs.")
    code = [
        ("RoomType", "RoomType"),
        ("Room", "Room"),
        ("Booking", "Booking"),
        ("BookingItem", "BookingItem"),
        ("BookingRoomAssignment", "BookingRoomAssignment"),
        ("BookingCharge", "BookingCharge"),
        ("PaymentRecord", "PaymentRecord"),
        ("SpecialOffer", "SpecialOffer"),
        ("StaffAccount", "ApplicationUser"),
        ("StaffRole", "IdentityRole"),
        ("StaffAccountLogin", "Identity user login"),
        ("StaffAccountToken", "Identity user token"),
        ("StaffAccountAudit", "StaffAccountAudit"),
        ("SystemFlushLog", "SystemFlushLog"),
    ]
    cmap = doc.add_table(rows=1 + len(code), cols=2)
    cmap.style = "Table Grid"
    cmap.rows[0].cells[0].text = ""
    cmap.rows[0].cells[1].text = ""
    h0 = cmap.rows[0].cells[0].paragraphs[0].add_run("Table")
    h1 = cmap.rows[0].cells[1].paragraphs[0].add_run("C# type")
    set_run_font(h0, size=10, bold=True)
    set_run_font(h1, size=10, bold=True)
    shade_header_row(cmap)
    for i, (tbl, typ) in enumerate(code, start=1):
        cmap.rows[i].cells[0].text = ""
        cmap.rows[i].cells[1].text = ""
        r0 = cmap.rows[i].cells[0].paragraphs[0].add_run(tbl)
        r1 = cmap.rows[i].cells[1].paragraphs[0].add_run(typ)
        set_run_font(r0, size=10, bold=True)
        set_run_font(r1, size=10)

    doc.save(OUT)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
