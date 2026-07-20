using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

var outputPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Room-Management-Use-Cases.docx"));

var dir = Path.GetDirectoryName(outputPath)!;
Directory.CreateDirectory(dir);

using var doc = WordprocessingDocument.Create(outputPath, WordprocessingDocumentType.Document);
var mainPart = doc.AddMainDocumentPart();
mainPart.Document = new Document(new Body());
var body = mainPart.Document.Body!;

void AddParagraph(string text, string? style = null, bool bold = false)
{
    var run = new Run();
    if (bold)
        run.AppendChild(new RunProperties(new Bold()));
    run.AppendChild(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
    var p = new Paragraph(run);
    if (style is not null)
        p.ParagraphProperties = new ParagraphProperties(new ParagraphStyleId { Val = style });
    body.AppendChild(p);
}

void AddTable(string[] headers, List<string[]> rows)
{
    var table = new Table();
    table.AppendChild(new TableProperties(
        new TableBorders(
            new TopBorder { Val = BorderValues.Single, Size = 4 },
            new BottomBorder { Val = BorderValues.Single, Size = 4 },
            new LeftBorder { Val = BorderValues.Single, Size = 4 },
            new RightBorder { Val = BorderValues.Single, Size = 4 },
            new InsideHorizontalBorder { Val = BorderValues.Single, Size = 4 },
            new InsideVerticalBorder { Val = BorderValues.Single, Size = 4 })));

    var headerRow = new TableRow();
    foreach (var h in headers)
    {
        var cell = new TableCell(new Paragraph(new Run(new RunProperties(new Bold()), new Text(h))));
        headerRow.AppendChild(cell);
    }
    table.AppendChild(headerRow);

    foreach (var row in rows)
    {
        var tr = new TableRow();
        foreach (var cellText in row)
            tr.AppendChild(new TableCell(new Paragraph(new Run(new Text(cellText)))));
        table.AppendChild(tr);
    }

    body.AppendChild(table);
    body.AppendChild(new Paragraph());
}

void AddUseCase(string id, string name, string actor, string description,
    string pre, string post, string trigger,
    string[] mainFlow, string[]? alt = null, string[]? exc = null, string[]? rules = null)
{
    AddParagraph($"{id}: {name}", "Heading2");
    AddTable(["Field", "Description"],
    [
        ["Use Case ID", id],
        ["Name", name],
        ["Actor", actor],
        ["Description", description],
        ["Preconditions", pre],
        ["Postconditions", post],
        ["Trigger", trigger]
    ]);
    AddParagraph("Main Success Scenario", "Heading3");
    foreach (var step in mainFlow) AddParagraph(step);
    if (alt is { Length: > 0 })
    {
        AddParagraph("Alternative Flows", "Heading3");
        foreach (var step in alt) AddParagraph(step);
    }
    if (exc is { Length: > 0 })
    {
        AddParagraph("Exception Flows", "Heading3");
        foreach (var step in exc) AddParagraph(step);
    }
    if (rules is { Length: > 0 })
    {
        AddParagraph("Business Rules", "Heading3");
        foreach (var rule in rules) AddParagraph(rule);
    }
    body.AppendChild(new Paragraph());
}

// Title
AddParagraph("Hotel Booking System", "Title");
AddParagraph("Room Management Module - Written Use Cases", "Heading1");
AddParagraph("Document Version: 1.0");
AddParagraph("Date: March 10, 2026");
AddParagraph("System: Hotel Booking System (Clean Architecture - .NET 9 MVC)");
AddParagraph("Module: Room Management (CRUD, Amenities, Inclusions)");
body.AppendChild(new Paragraph());

AddParagraph("1. Introduction", "Heading1");
AddParagraph("This document provides formal written use case specifications for the Room Management module of the Hotel Booking System. It describes the interactions between Hotel Staff and the system for managing room inventory, amenities, and inclusions.");
body.AppendChild(new Paragraph());

AddParagraph("2. Actors", "Heading1");
AddTable(["Actor", "Description"],
[
    ["Hotel Staff", "Front desk or admin user who manages room inventory, pricing, amenities, and inclusions."],
    ["System", "Application layer that validates input and persists data via EF Core and Unit of Work."]
]);

AddParagraph("3. Use Case Specifications", "Heading1");

AddUseCase("UC-01", "View Room List", "Hotel Staff",
    "Hotel Staff views a table of all rooms with key details, amenities, inclusions, and availability status.",
    "System is running; database is accessible.",
    "Staff sees the current room inventory list. No data is modified.",
    "Staff navigates to Rooms in the navigation menu or visits /Rooms.",
    [
        "1. Staff selects Rooms from the navigation bar.",
        "2. System retrieves all rooms with amenities and inclusions from the database.",
        "3. System displays the room list sorted by room number.",
        "4. Staff reviews the list."
    ],
    [
        "A1 - No rooms exist: System displays 'No rooms yet. Create your first room to get started.'",
        "A2 - Success message from prior create/edit/delete action is shown."
    ]);

AddUseCase("UC-02", "View Room Details", "Hotel Staff",
    "Staff views the full profile of a single room including all attributes, amenities, and inclusions.",
    "The room exists in the database.",
    "Staff has viewed the room details. No data is modified.",
    "Staff clicks Details on a room in the list.",
    [
        "1. Staff clicks Details for a room.",
        "2. System retrieves the room by ID with amenities and inclusions.",
        "3. System displays full room profile.",
        "4. Staff may click Edit or Back to List."
    ],
    exc: ["E1 - Room not found: System returns HTTP 404 Not Found."]);

AddUseCase("UC-03", "Create Rooms (Bulk)", "Hotel Staff",
    "Staff creates one or more rooms (up to 50) sharing the same type details but with unique room numbers.",
    "Staff is on the Create Rooms form; catalogs are loaded.",
    "One or more new room records are saved. Staff is redirected to room list.",
    "Staff clicks Create Room on the room list.",
    [
        "1. Staff clicks Create Room.",
        "2. System displays the Create Rooms form.",
        "3. Staff enters shared room details.",
        "4. Staff enters How Many Rooms.",
        "5. System shows room number input fields dynamically.",
        "6. Staff enters unique room numbers for each.",
        "7. Staff optionally selects amenities and inclusions.",
        "8. Staff clicks Create Rooms.",
        "9. System validates all fields and uniqueness.",
        "10. System creates all rooms in one transaction.",
        "11. System redirects with success message."
    ],
    [
        "A1 - Single room: count of 1 creates one room.",
        "A2 - Add amenity during create (UC-06).",
        "A3 - Add inclusion during create (UC-07)."
    ],
    [
        "E1 - Validation failure: form redisplays with errors.",
        "E2 - Duplicate room number: error displayed.",
        "E3 - Room count mismatch: all slots must have numbers."
    ],
    [
        "BR-01: Room numbers must be unique.",
        "BR-02: Bulk create allows 1-50 rooms.",
        "BR-03: Shared type details across all rooms in one submission."
    ]);

AddUseCase("UC-04", "Edit Room", "Hotel Staff",
    "Staff updates an existing room's details, pricing, availability, amenities, and inclusions.",
    "The room exists in the database.",
    "Room is updated with UpdatedAt. Staff redirected to list.",
    "Staff clicks Edit on a room.",
    [
        "1. Staff clicks Edit.",
        "2. System loads room into edit form.",
        "3. Staff modifies fields and clicks Save.",
        "4. System validates and updates room and links.",
        "5. System redirects with success message."
    ],
    exc: [
        "E1 - Room not found: HTTP 404.",
        "E2 - ID tampering: HTTP 400.",
        "E3 - Duplicate room number.",
        "E4 - Validation failure."
    ]);

AddUseCase("UC-05", "Delete Room", "Hotel Staff",
    "Staff permanently removes a room after confirmation.",
    "The room exists in the database.",
    "Room and junction links deleted. Staff redirected to list.",
    "Staff clicks Delete on a room.",
    [
        "1. Staff clicks Delete.",
        "2. System shows confirmation page.",
        "3. Staff confirms deletion.",
        "4. System deletes room (cascade junction links).",
        "5. System redirects with success message."
    ],
    ["A1 - Cancel: returns to list without changes."],
    ["E1 - Room not found: HTTP 404."],
    ["BR-04: Catalog amenities/inclusions are not deleted."]);

AddUseCase("UC-06", "Add New Amenity", "Hotel Staff",
    "Staff adds a new amenity to the shared catalog during create or edit.",
    "Staff is on Create or Edit room form.",
    "Amenity saved and appears checked in the list.",
    "Staff types name and clicks Add or presses Enter.",
    [
        "1. Staff enters amenity name.",
        "2. AJAX POST to /Rooms/AddAmenity.",
        "3. System validates and saves (or reuses existing).",
        "4. Checkbox appended to form, pre-selected."
    ],
    exc: ["E1 - Empty name or validation failure."]);

AddUseCase("UC-07", "Add New Inclusion", "Hotel Staff",
    "Staff adds a new inclusion to the shared catalog during create or edit.",
    "Staff is on Create or Edit room form.",
    "Inclusion saved and appears checked in the list.",
    "Staff types name and clicks Add or presses Enter.",
    [
        "1. Staff enters inclusion name.",
        "2. AJAX POST to /Rooms/AddInclusion.",
        "3. System validates and saves.",
        "4. Checkbox appended to form, pre-selected."
    ],
    exc: ["E1 - Empty name or validation failure."]);

AddUseCase("UC-08", "Assign Amenities to Room", "Hotel Staff",
    "Staff selects amenities to associate with a room.",
    "Catalog loaded; staff on Create or Edit form.",
    "RoomAmenity links created on save.",
    "Staff checks amenity checkboxes.",
    [
        "1. Staff views active amenities.",
        "2. Staff checks desired items.",
        "3. System creates RoomAmenity records on submit."
    ],
    rules: [
        "BR-06: Many-to-many Room ↔ Amenity.",
        "BR-07: Only active amenities shown.",
        "BR-08: Amenity delete RESTRICT if referenced."
    ]);

AddUseCase("UC-09", "Assign Inclusions to Room", "Hotel Staff",
    "Staff selects inclusions to bundle with a room.",
    "Catalog loaded; staff on Create or Edit form.",
    "RoomInclusion links created on save.",
    "Staff checks inclusion checkboxes.",
    [
        "1. Staff views active inclusions.",
        "2. Staff checks desired items.",
        "3. System creates RoomInclusion records on submit."
    ],
    rules: ["BR-09: Same many-to-many rules as amenities."]);

AddUseCase("UC-10", "Validate Room Data", "System",
    "System validates input via FluentValidation, DataAnnotations, and controller checks.",
    "Staff submitted create or edit form.",
    "Data validated or rejected with messages.",
    "Included on every create/edit submission.",
    [
        "1. Controller receives form data.",
        "2. DataAnnotations validate ViewModel.",
        "3. Controller checks room count and uniqueness.",
        "4. FluentValidation validates DTO.",
        "5. Proceed to UC-11 or return errors."
    ],
    rules: [
        "Name: required, max 100. Room Number: required, unique, max 20.",
        "Price > 0. Occupancy 1-20. Beds 1-10. Bulk: 1-50 rooms."
    ]);

AddUseCase("UC-11", "Persist to Database", "System",
    "System saves data via Repository, Unit of Work, and EF Core.",
    "Data passed validation (UC-10).",
    "Data committed to SQL Server.",
    "Included after successful validation.",
    [
        "1. Service receives validated DTO.",
        "2. Maps to domain entity.",
        "3. Applies amenity/inclusion links.",
        "4. Repository persists entity.",
        "5. Unit of Work SaveChangesAsync (single transaction)."
    ]);

AddParagraph("4. Use Case Relationships", "Heading1");
AddTable(["Relationship", "From", "To", "Type"],
[
    ["Include", "UC-03", "UC-10", "Validate before save"],
    ["Include", "UC-04", "UC-10", "Validate before save"],
    ["Include", "UC-10", "UC-11", "Validate then persist"],
    ["Extend", "UC-03", "UC-06/07/08/09", "Optional during create"],
    ["Association", "UC-04", "UC-06/07/08/09", "Same on edit"]
]);

AddParagraph("5. Business Rules Summary", "Heading1");
AddParagraph("1. Room numbers must be unique across the hotel.");
AddParagraph("2. Bulk create: 1-50 rooms per submission.");
AddParagraph("3. Amenities and inclusions are shared catalogs.");
AddParagraph("4. Duplicate names reuse existing catalog entries.");
AddParagraph("5. Room delete cascades junction links only.");
AddParagraph("6. Catalog delete blocked if rooms reference it.");

AddParagraph("6. Entity Overview", "Heading1");
AddTable(["Entity", "Description", "Key Fields"],
[
    ["Room", "Physical hotel room", "Id (PK), RoomNumber (UK), Name, PricePerNight"],
    ["Amenity", "Room feature catalog", "Id (PK), Name, IsActive"],
    ["Inclusion", "Bundled service catalog", "Id (PK), Name, IsActive"],
    ["RoomAmenity", "Junction table", "RoomId + AmenityId (PK)"],
    ["RoomInclusion", "Junction table", "RoomId + InclusionId (PK)"]
]);

mainPart.Document.Save();
Console.WriteLine($"Created: {outputPath}");

