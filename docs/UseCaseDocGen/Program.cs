using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

var outputPath = Path.GetFullPath(Path.Combine(
    AppContext.BaseDirectory, "..", "..", "..", "..", "Hotel-Use-Cases.docx"));
Directory.CreateDirectory(Path.GetDirectoryName(outputPath)!);

using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
var mainPart = doc.AddMainDocumentPart();
mainPart.Document = new Document(new Body());
var body = mainPart.Document.Body!;

void P(string text, string? style = null, bool bold = false, string? font = null)
{
    var runProps = new RunProperties();
    if (bold) runProps.AppendChild(new Bold());
    if (font is not null)
    {
        runProps.AppendChild(new RunFonts { Ascii = font, HighAnsi = font });
        runProps.AppendChild(new FontSize { Val = "18" });
    }

    var run = new Run();
    run.AppendChild(runProps);
    run.AppendChild(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
    var p = new Paragraph(run);
    if (style is not null)
        p.ParagraphProperties = new ParagraphProperties(new ParagraphStyleId { Val = style });
    body.AppendChild(p);
}

void Blank() => body.AppendChild(new Paragraph());

void Mono(string text)
{
    foreach (var line in text.Replace("\r\n", "\n").Split('\n'))
        P(line.Length == 0 ? " " : line, font: "Consolas");
}

void Table(string[] headers, List<string[]> rows)
{
    var table = new Table(
        new TableProperties(
        new TableBorders(
            new TopBorder { Val = BorderValues.Single, Size = 4 },
            new BottomBorder { Val = BorderValues.Single, Size = 4 },
            new LeftBorder { Val = BorderValues.Single, Size = 4 },
            new RightBorder { Val = BorderValues.Single, Size = 4 },
            new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
            new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 })));

    var headerRow = new TableRow();
    foreach (var h in headers)
        headerRow.AppendChild(new TableCell(new Paragraph(new Run(new RunProperties(new Bold()), new Text(h)))));
    table.AppendChild(headerRow);

    foreach (var row in rows)
    {
        var tr = new TableRow();
        foreach (var cell in row)
            tr.AppendChild(new TableCell(new Paragraph(new Run(new Text(cell)))));
        table.AppendChild(tr);
    }

    body.AppendChild(table);
    Blank();
}

void AddUseCase(
    string id, string name, string actor, string description,
    string pre, string post, string trigger,
    string[] main, string[]? alt = null, string[]? exc = null, string[]? rules = null)
{
    P($"{id}: {name}", "Heading2");
    Table(["Field", "Description"],
    [
        ["Use Case ID", id],
        ["Name", name],
        ["Primary actor", actor],
        ["Description", description],
        ["Preconditions", pre],
        ["Postconditions", post],
        ["Trigger", trigger],
    ]);
    P("Main success scenario", "Heading3");
    foreach (var s in main) P(s);
    if (alt is { Length: > 0 })
    {
        P("Alternative flows", "Heading3");
        foreach (var s in alt) P(s);
    }
    if (exc is { Length: > 0 })
    {
        P("Exception flows", "Heading3");
        foreach (var s in exc) P(s);
    }
    if (rules is { Length: > 0 })
    {
        P("Business rules", "Heading3");
        foreach (var s in rules) P(s);
    }
    Blank();
}

P("Mori International Hotel", "Title");
P("Hotel System — Written Use Cases & Use Case Diagrams", "Heading1");
P("Document version: 2.0");
P($"Generated: {DateTime.Now:yyyy-MM-dd}");
P("System: ASP.NET Core MVC (.NET 9) + EF Core SQL Server + Room Management React SPA");
P("Replaces: Room-Management-Use-Cases.docx (module-only). This file covers the whole hotel system.");
Blank();

P("1. Introduction", "Heading1");
P("Formal use cases for guest booking/reviews/chat, room inventory, admin bookings and walk-ins, payments (OCR), special offers, staff auth, dashboard, audit, and background automation. Diagrams are textual UML-style drawings.");
Blank();

P("2. Actors", "Heading1");
Table(["Actor", "Description"],
[
    ["Guest (anonymous)", "Public visitor: browse, book, reviews, chat, cookies."],
    ["Guest (signed-in)", "Google/Identity guest: loyalty, reviews, account settings."],
    ["Receptionist", "Front desk: bookings, walk-in, assign, payments."],
    ["AdminManager", "Full admin: staff, rooms, offers, audit, flush, dashboard."],
    ["System", "Background jobs, validation, rate limits, SignalR, OCR, seed/health."],
]);

P("3. System context diagram", "Heading1");
Mono("""
                    ┌─────────────────────────────────────────────────────────┐
                    │              Mori International Hotel System            │
  Guest ────────────┤  Book · Browse · Chat · Reviews · Cookies · i18n        │
  Receptionist ─────┤  Bookings · Walk-in · Assign · Payments · OCR           │
  AdminManager ─────┤  Rooms · Offers · Staff · Audit · Flush · Dashboard     │
                    │  «include» System: validate · persist · notify · auto   │
                    └─────────────────────────────────────────────────────────┘
""");

P("4. Package overview diagram", "Heading1");
Mono("""
  ┌─ Guest/Public ──┐  ┌─ Room Mgmt ─┐  ┌─ Admin Bookings ─┐  ┌─ Payments ─┐
  │ UC-G01 … UC-G12 │  │ UC-R01…R08  │  │ UC-B01 … UC-B12  │  │ UC-P01…P05 │
  └─────────────────┘  └─────────────┘  └──────────────────┘  └────────────┘
  ┌─ Special Offers ─┐  ┌─ Auth/Staff ─┐  ┌─ Ops/System ─┐
  │ UC-O01 … UC-O06  │  │ UC-A01…A08   │  │ UC-S01…S06   │
  └──────────────────┘  └──────────────┘  └──────────────┘
""");

P("5. Guest / public", "Heading1");
Mono("""
  Guest ---- Browse accommodations (UC-G01)
        ---- Check availability (UC-G02)
        ---- Book stay online (UC-G03)
        ---- Accommodations wizard (UC-G04)
        ---- Terms / privacy / cookies (UC-G05)
        ---- Mori Assistant chat (UC-G06)
        ---- Google sign-in (UC-G07)
        ---- Account settings (UC-G08)
        ---- Write/edit stay review (UC-G09)
        ---- View public reviews (UC-G10)
        ---- Translate content (UC-G11)
        ---- Select language (UC-G12)
""");

AddUseCase("UC-G01", "Browse accommodations / room types", "Guest",
    "View sellable RoomTypes with photos, inclusions, and rates.",
    "App running; catalog exists.", "Catalog shown; no write.", "Open / or Accommodations.",
    ["1. Guest opens guest site.", "2. System loads Available inventory by RoomType.", "3. Guest browses cards/details."],
    ["A1 - Empty inventory messaging."]);

AddUseCase("UC-G02", "Check availability", "Guest",
    "Date-range availability and sold-out nights per type.",
    "Valid dates.", "Snapshot returned.", "Change dates / availability API.",
    ["1. Guest sets check-in/out.", "2. System counts Pending/Confirmed holds.", "3. UI updates remaining/sold-out."],
    rules: ["BR-G01: Hold statuses Pending+Confirmed.", "BR-G02: UTC storage, Manila display."]);

AddUseCase("UC-G03", "Book stay (online)", "Guest",
    "Submit online booking cart with party, fees, optional offer.",
    "Inventory + antiforgery + rate limit.", "Booking created; reference shown.", "Confirm book.",
    ["1. Build cart/party.", "2. Optional offer/loyalty.", "3. Submit.", "4. Serializable create.", "5. Success + admin notify."],
    ["A1 - Near-arrival vs far reservation lead time."],
    ["E1 - Sold out/concurrency.", "E2 - 429.", "E3 - Validation."],
    ["BR-G03: Single book flow (no separate Reserve page).", "BR-G04: Extra person per room."]);

AddUseCase("UC-G04", "Accommodations wizard", "Guest",
    "Multi-step stay wizard; drafts gated by cookie consent.",
    "On Accommodations.", "Booking if submitted.", "Wizard steps.",
    ["1. Dates/rooms.", "2. Draft only if Accept all.", "3. Guests confirm → UC-G03."],
    ["A1 - Necessary only blocks drafts."]);

AddUseCase("UC-G05", "Terms / privacy / cookies", "Guest",
    "Read legal pages; set Accept all vs Necessary only.",
    "Pages published.", "Consent stored.", "Footer/banner.",
    ["1. Open legal/banner.", "2. Choose consent.", "3. Apply draft policy."]);

AddUseCase("UC-G06", "Chat with Mori Assistant", "Guest",
    "FAQ/chat via rules + optional LLM under rate limits.",
    "Chatbot enabled.", "Reply in session.", "Send message.",
    ["1. Post message.", "2. Guardrails + guest-chat limit.", "3. Rules/LLM reply."],
    exc: ["E1 - Provider down.", "E2 - 429."]);

AddUseCase("UC-G07", "Google sign-in (guest)", "Guest",
    "OAuth into Guest role.",
    "Google SecureSettings.", "Signed-in guest.", "Google button.",
    ["1. Challenge.", "2. Link/create user.", "3. Cookie sign-in."],
    exc: ["E1 - Not configured."]);

AddUseCase("UC-G08", "Guest account settings", "Guest (signed-in)",
    "Update guest account settings.",
    "Authenticated Guest.", "Saved.", "Account Settings.",
    ["1. Load.", "2. Edit.", "3. Save."]);

AddUseCase("UC-G09", "Write / edit stay review", "Guest (signed-in)",
    "Post-checkout StayReview for owned booking.",
    "CheckedOut + ownership.", "Review saved.", "Guest portal Reviews.",
    ["1. Open eligible stay.", "2. Rate + comment.", "3. Ownership check + save."],
    exc: ["E1 - Not eligible.", "E2 - Unauthorized."]);

AddUseCase("UC-G10", "View public reviews", "Guest",
    "Read published reviews.",
    "Published rows.", "Displayed.", "Public reviews UI.",
    ["1. Load published.", "2. Show ratings/replies."]);

AddUseCase("UC-G11", "Translate content", "Guest",
    "Translate review/chat text (rate-limited).",
    "Translate API.", "Translated text.", "Translate action.",
    ["1. Post text.", "2. Translate.", "3. Display."],
    exc: ["E1 - Failure/limit."]);

AddUseCase("UC-G12", "Select language", "Guest",
    "Switch UI locale (en/ja/ko/ru/zh-Hans).",
    "Locale JSON.", "UI updated.", "Language control.",
    ["1. Pick language.", "2. Apply data-i18n."]);

P("6. Room management (admin SPA)", "Heading1");
Mono("""
  Staff ---- View rooms/types (UC-R01)
        ---- Create room type (UC-R02)
        ---- Edit room type (UC-R03)
        ---- Create physical rooms (UC-R04)
        ---- Edit room / status (UC-R05)
        ---- Delete room/type (UC-R06)
        ---- Live catalog notify (UC-R07)
        ---- Validate & persist «include» (UC-R08)
""");

AddUseCase("UC-R01", "View rooms / types", "Receptionist, AdminManager",
    "List RoomTypes and Rooms in SPA.", "Staff auth.", "List shown.", "/Rooms.",
    ["1. Open Rooms.", "2. Load APIs.", "3. Render inventory."]);

AddUseCase("UC-R02", "Create room type", "Receptionist, AdminManager",
    "Create RoomType with rate, inclusions, images.", "Form + antiforgery.", "Type saved.", "Submit create.",
    ["1. Enter details.", "2. Validate unique name.", "3. Persist JSON fields."],
    exc: ["E1 - Validation/duplicate."]);

AddUseCase("UC-R03", "Edit room type", "Receptionist, AdminManager",
    "Update type fields/photos.", "Exists.", "Updated.", "Save edit.",
    ["1. Edit.", "2. Validate.", "3. Save."]);

AddUseCase("UC-R04", "Create physical rooms", "Receptionist, AdminManager",
    "Add Room door numbers under a type.", "Type exists.", "Rooms created.", "Create rooms.",
    ["1. Enter numbers.", "2. Unique RoomNumber.", "3. Save."],
    rules: ["BR-R01: RoomNumber unique."]);

AddUseCase("UC-R05", "Edit room / status", "Receptionist, AdminManager",
    "Change number/status (Available/Unavailable/Occupied/Cleaning).", "Exists.", "Updated.", "Save.",
    ["1. Change.", "2. Save.", "3. Guest availability uses Available."]);

AddUseCase("UC-R06", "Delete room / type", "Receptionist, AdminManager",
    "Delete when safe.", "Guards pass.", "Removed or error.", "Confirm delete.",
    ["1. Confirm.", "2. FK checks.", "3. Delete or block."],
    exc: ["E1 - In use."]);

AddUseCase("UC-R07", "Live guest catalog notify", "System",
    "SignalR guest catalog refresh after inventory change.", "Hub mapped.", "Clients refresh.", "Mutation success.",
    ["1. Commit.", "2. Notify hub.", "3. Clients reload."]);

AddUseCase("UC-R08", "Validate & persist inventory", "System",
    "Shared write path.", "Request in.", "Consistent DB.", "Included by writes.",
    ["1. Validate.", "2. SaveChanges.", "3. Return."]);

P("7. Admin bookings & walk-in", "Heading1");
Mono("""
  Staff ---- List/filter (UC-B01) · Detail (UC-B02) · Status (UC-B03)
        ---- Assign rooms (UC-B04) · Charges (UC-B05) · Checkout (UC-B06)
        ---- Cancel (UC-B07) · Walk-in (UC-B08) · Calendar (UC-B09)
        ---- Notifications (UC-B10) · Flush history (UC-B11) · SignalR (UC-B12)
""");

AddUseCase("UC-B01", "List / filter bookings", "Receptionist, AdminManager",
    "Paged booking list.", "Authorized.", "List shown.", "Admin Bookings.",
    ["1. Open page.", "2. Paged API.", "3. Render."]);

AddUseCase("UC-B02", "View booking detail", "Receptionist, AdminManager",
    "Full stay detail.", "Exists.", "Detail shown.", "Select row.",
    ["1. Select.", "2. Load aggregates.", "3. Show panels."]);

AddUseCase("UC-B03", "Update booking status", "Receptionist, AdminManager",
    "Confirm/reject/update status.", "Editable.", "Status saved.", "Status action.",
    ["1. Choose status.", "2. Validate transition.", "3. Save + notify."],
    exc: ["E1 - Invalid transition.", "E2 - Availability."]);

AddUseCase("UC-B04", "Assign physical rooms", "Receptionist, AdminManager",
    "BookingRoomAssignment to free rooms.", "Allowed status.", "Assigned/Occupied.", "Assign UI.",
    ["1. Pick rooms.", "2. Overlap/unique checks.", "3. Save txn."],
    rules: ["BR-B01: Unique assignment pair."]);

AddUseCase("UC-B05", "Update stay charges / fees", "Receptionist, AdminManager",
    "Early/late/extra/incidentals/snacks.", "Allowed.", "Charges + totals.", "Fee save.",
    ["1. Select fees/indexes.", "2. Upsert BookingCharge.", "3. Recalc totals."]);

AddUseCase("UC-B06", "Checkout stay", "Receptionist, AdminManager",
    "Mark CheckedOut; release rooms.", "Active stay.", "CheckedOut.", "Checkout.",
    ["1. Confirm.", "2. Status + release.", "3. Notify."]);

AddUseCase("UC-B07", "Cancel stay", "Receptionist, AdminManager",
    "Cancel and free holds.", "Cancellable.", "Cancelled.", "Cancel.",
    ["1. Confirm.", "2. Cancel + release."]);

AddUseCase("UC-B08", "Create walk-in", "Receptionist, AdminManager",
    "WalkIn channel booking.", "Inventory OK.", "Booking created.", "Walk-in modal.",
    ["1. Enter stay.", "2. CreateWalkInAsync.", "3. Success UI."]);

AddUseCase("UC-B09", "Reservation calendar", "Receptionist, AdminManager",
    "Calendar occupancy.", "Data OK.", "Rendered.", "Calendar view.",
    ["1. Load DTO.", "2. FullCalendar."]);

AddUseCase("UC-B10", "Notifications / mark read", "Receptionist, AdminManager",
    "Bell notifications.", "Unread exist.", "Cleared flags.", "Bell actions.",
    ["1. List.", "2. Mark read."]);

AddUseCase("UC-B11", "Flush booking history", "AdminManager",
    "Archive/export history; flush log ~7d.", "AdminManager.", "Archived + log.", "Flush.",
    ["1. Confirm.", "2. Archive/log.", "3. Purge old logs."]);

AddUseCase("UC-B12", "Live booking hub", "System",
    "SignalR /hubs/bookings.", "Connected admin.", "UI live update.", "Mutation.",
    ["1. Publish.", "2. Broadcast.", "3. Client refresh."]);

P("8. Payments", "Heading1");
Mono("""
  Staff ---- Post payment (UC-P01) · Void (UC-P02) · OCR receipt (UC-P03)
        ---- List/filter (UC-P04) · Flush payments (UC-P05)
""");

AddUseCase("UC-P01", "Post payment", "Receptionist, AdminManager",
    "Post Cash/EWallet PaymentRecord.", "Booking exists.", "Posted.", "Submit payment.",
    ["1. Amount/method/refs.", "2. Post record.", "3. Show balance."],
    rules: ["BR-P01: No PAN; e-wallet ref + image."]);

AddUseCase("UC-P02", "Void payment", "Receptionist, AdminManager",
    "Void posted payment.", "Posted.", "Voided.", "Void.",
    ["1. Reason.", "2. Mark Voided."]);

AddUseCase("UC-P03", "Upload / OCR receipt", "Receptionist, AdminManager",
    "Capture receipt; Azure OCR / local parse.", "Upload OK.", "Fields + image.", "Camera/upload.",
    ["1. Capture.", "2. Store + OCR.", "3. Prefill ref/amount."],
    ["A1 - Budget/local fallback."], ["E1 - Unreadable."]);

AddUseCase("UC-P04", "List payments", "Receptionist, AdminManager",
    "Filter by day/collector.", "Authorized.", "List.", "Payments page.",
    ["1. Filter.", "2. API.", "3. Render."]);

AddUseCase("UC-P05", "Flush payment history", "AdminManager",
    "Flush payments + SystemFlushLog.", "AdminManager.", "Flushed.", "Flush payments.",
    ["1. Confirm.", "2. Flush/log."]);

P("9. Special offers", "Heading1");
Mono("""
  AdminManager ---- List (UC-O01) · Create (UC-O02) · Edit (UC-O03)
                 ---- Deactivate/reactivate (UC-O04) · Delete (UC-O05)
  Guest/Walk-in ---- Apply offer at book (UC-O06)
""");

AddUseCase("UC-O01", "List offers", "AdminManager, Receptionist", "SPA list.", "Auth.", "Listed.", "Offers page.",
    ["1. GET API.", "2. Render."]);
AddUseCase("UC-O02", "Create offer", "AdminManager", "Limited Time / Stay Longer / Loyalty.", "Form.", "Saved.", "Create.",
    ["1. Fill.", "2. Validate.", "3. Persist siblings."]);
AddUseCase("UC-O03", "Edit offer", "AdminManager", "Update campaign.", "Exists.", "Updated.", "Edit save.",
    ["1. Edit.", "2. Save."]);
AddUseCase("UC-O04", "Deactivate / reactivate", "AdminManager", "API + antiforgery.", "AdminManager.", "Active/window set.", "SPA action.",
    ["1. Confirm.", "2. Token header.", "3. Update."]);
AddUseCase("UC-O05", "Delete offer", "AdminManager", "Hard delete; booking FK null.", "AdminManager.", "Deleted.", "Delete.",
    ["1. Confirm.", "2. DELETE + antiforgery."]);
AddUseCase("UC-O06", "Apply offer at book", "Guest / Receptionist", "Promo/loyalty pricing.", "Offer active.", "Rates applied.", "Book/walk-in.",
    ["1. Resolve offer.", "2. Apply.", "3. Save booking."]);

P("10. Authentication & staff", "Heading1");
Mono("""
  Staff ---- Login/logout (UC-A01) · Must change password (UC-A02)
        ---- Reset OTP (UC-A03) · Google recovery (UC-A04)
  AdminManager ---- Create staff (UC-A05) · Edit (UC-A06) · Retention delete (UC-A07)
  System ---- First-run seed (UC-A08)
""");

AddUseCase("UC-A01", "Staff login / logout", "Staff", "Cookie auth + lockout.", "Account exists.", "In/out.", "Login/logout.",
    ["1. Credentials.", "2. Identity + lockout.", "3. Redirect."],
    exc: ["E1 - Bad password.", "E2 - Locked."],
    rules: ["BR-A01: Password ≥ 12 + complexity."]);
AddUseCase("UC-A02", "Must change password", "Staff", "Forced change middleware.", "Flag true.", "Flag cleared.", "Navigate admin.",
    ["1. Redirect.", "2. Set password.", "3. Continue."]);
AddUseCase("UC-A03", "Forgot / reset OTP", "Staff", "Email OTP reset.", "SMTP.", "Reset done.", "Forgot flow.",
    ["1. Request.", "2. Email code.", "3. Verify + set."],
    exc: ["E1 - Rate limit.", "E2 - Expired."]);
AddUseCase("UC-A04", "Link Google recovery", "Staff", "Verify recovery Gmail.", "Google cfg.", "Verified status.", "Link flow.",
    ["1. Start.", "2. OAuth.", "3. Status update."]);
AddUseCase("UC-A05", "Create staff", "AdminManager", "Create role + temp password email.", "AdminManager.", "User created.", "Users create.",
    ["1. Profile.", "2. Temp password.", "3. Email; MustChangePassword."]);
AddUseCase("UC-A06", "Edit staff", "AdminManager", "Update profile/role.", "Exists.", "Updated.", "Edit save.",
    ["1. Edit.", "2. Save + audit."]);
AddUseCase("UC-A07", "Staff delete retention", "AdminManager", "Lifecycle retention days.", "Policy.", "Removed per policy.", "Delete.",
    ["1. Confirm.", "2. Apply retention."]);
AddUseCase("UC-A08", "First-run admin seed", "System", "Dev seed admin.manager; password file only.", "Seed allowed; no admin.", "Admin created.", "Startup.",
    ["1. Check flag.", "2. Create.", "3. Write LocalAppData file; log path only."],
    rules: ["BR-A02: Production seed false."]);

P("11. Dashboard, audit, automation", "Heading1");
Mono("""
  Staff ---- Dashboard (UC-S01) · Audit search (UC-S02)
  System ---- Auto checkout/warnings (UC-S03) · Offer expiry (UC-S04)
         ---- Single-instance guard (UC-S05) · Health (UC-S06)
""");

AddUseCase("UC-S01", "Dashboard analytics", "Receptionist, AdminManager", "Widgets + layout JSON.", "Auth.", "Charts.", "/Dashboard.",
    ["1. Analytics API.", "2. Render.", "3. Optional layout save."]);
AddUseCase("UC-S02", "Search audit log", "AdminManager", "Query SystemAuditLog.", "AdminManager.", "Results.", "Audit UI.",
    ["1. Filters.", "2. Query."]);
AddUseCase("UC-S03", "Auto checkout / warnings", "System", "BackgroundService timers.", "Single instance.", "Bookings updated.", "~15s tick.",
    ["1. Tick.", "2. Warnings/auto.", "3. Notify."]);
AddUseCase("UC-S04", "Offer expiry warnings", "System", "Ending offer warnings.", "Single instance.", "Warned once.", "~30s tick.",
    ["1. Scan.", "2. Notify if new."]);
AddUseCase("UC-S05", "Single-instance guard", "System", "SQL applock one process.", "Enforce true.", "Lock or fail start.", "Hosted start.",
    ["1. Connect.", "2. sp_getapplock.", "3. Hold."]);
AddUseCase("UC-S06", "Health check", "Ops/System", "GET /health SQL ping.", "App up.", "Healthy/Unhealthy.", "Probe.",
    ["1. Open SQL.", "2. SELECT 1.", "3. Status."]);

P("12. Cross-cutting relationships", "Heading1");
Table(["Type", "From", "To", "Notes"],
[
    ["include", "UC-G03 / UC-B08", "Validate + Serializable", "BookingService"],
    ["include", "UC-R02–R06", "UC-R08", "Inventory writes"],
    ["include", "Payment/Offer APIs", "Antiforgery", "RequestVerificationToken"],
    ["extend", "UC-G03", "UC-O06", "Optional promo"],
    ["extend", "UC-P01", "UC-P03", "Optional OCR"],
    ["include", "UC-B03–B06", "UC-B12", "Live admin"],
    ["association", "UC-G09", "UC-B06", "Review after checkout"],
]);

P("13. Non-goals", "Heading1");
P("Multi-property/region, Redis scale-out, PCI card vault, separate Reserve microsite, Kubernetes.");

P("14. Related documents", "Heading1");
P("Schema: docs/HotelDb-Schema.md and docs/HotelDb-Schema-updated.docx — generate with docs/HotelDb-Schema-updated.docs.ps1.");
P("Ops: docs/ops-deploy.md.");

mainPart.Document.Save();
Console.WriteLine($"Created: {outputPath}");
