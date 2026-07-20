$ErrorActionPreference = "Stop"
$outputPath = Join-Path $PSScriptRoot "Room-Management-Use-Cases.docx"

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$doc = $word.Documents.Add()
$selection = $word.Selection

function Add-Title($text) {
    $selection.Style = "Title"
    $selection.TypeText($text)
    $selection.TypeParagraph()
}

function Add-Heading1($text) {
    $selection.Style = "Heading 1"
    $selection.TypeText($text)
    $selection.TypeParagraph()
}

function Add-Heading2($text) {
    $selection.Style = "Heading 2"
    $selection.TypeText($text)
    $selection.TypeParagraph()
}

function Add-Heading3($text) {
    $selection.Style = "Heading 3"
    $selection.TypeText($text)
    $selection.TypeParagraph()
}

function Add-Body($text) {
    $selection.Style = "Normal"
    $selection.TypeText($text)
    $selection.TypeParagraph()
}

function Add-Table($headers, $rows) {
    $selection.Style = "Normal"
    $rowCount = $rows.Count + 1
    $colCount = $headers.Count
    $table = $doc.Tables.Add($selection.Range, $rowCount, $colCount)
    $table.Style = "Table Grid"

    for ($c = 0; $c -lt $colCount; $c++) {
        $cell = $table.Cell(1, $c + 1)
        $cell.Range.Text = $headers[$c]
        $cell.Range.Font.Bold = $true
    }

    for ($r = 0; $r -lt $rows.Count; $r++) {
        for ($c = 0; $c -lt $colCount; $c++) {
            $table.Cell($r + 2, $c + 1).Range.Text = $rows[$r][$c]
        }
    }

    $selection.EndKey(6) | Out-Null
    $selection.TypeParagraph()
}

function Add-UseCase($id, $name, $actor, $description, $pre, $post, $trigger, $mainFlow, $altFlows, $excFlows, $businessRules) {
    Add-Heading2("$id : $name")

    Add-Table @("Field", "Description") @(
        ,@("Use Case ID", $id)
        ,@("Name", $name)
        ,@("Actor", $actor)
        ,@("Description", $description)
        ,@("Preconditions", $pre)
        ,@("Postconditions", $post)
        ,@("Trigger", $trigger)
    )

    Add-Heading3("Main Success Scenario")
    foreach ($step in $mainFlow) { Add-Body($step) }

    if ($altFlows.Count -gt 0) {
        Add-Heading3("Alternative Flows")
        foreach ($step in $altFlows) { Add-Body($step) }
    }

    if ($excFlows.Count -gt 0) {
        Add-Heading3("Exception Flows")
        foreach ($step in $excFlows) { Add-Body($step) }
    }

    if ($businessRules.Count -gt 0) {
        Add-Heading3("Business Rules")
        foreach ($rule in $businessRules) { Add-Body($rule) }
    }

    $selection.TypeParagraph()
}

try {
    Add-Title("Hotel Booking System")
    Add-Heading1("Room Management Module - Written Use Cases")
    Add-Body("Document Version: 1.0")
    Add-Body("Date: March 10, 2026")
    Add-Body("System: Hotel Booking System (Clean Architecture - .NET 9 MVC)")
    Add-Body("Module: Room Management (CRUD, Amenities, Inclusions)")
    $selection.TypeParagraph()

    Add-Heading1("1. Introduction")
    Add-Body("This document provides formal written use case specifications for the Room Management module of the Hotel Booking System. It describes the interactions between Hotel Staff and the system for managing room inventory, amenities, and inclusions.")
    $selection.TypeParagraph()

    Add-Heading1("2. Actors")
    Add-Table @("Actor", "Description") @(
        ,@("Hotel Staff", "Front desk or admin user who manages room inventory, pricing, amenities, and inclusions.")
        ,@("System", "Application layer that validates input and persists data via EF Core and Unit of Work.")
    )

    Add-Heading1("3. Use Case Specifications")

    Add-UseCase "UC-01" "View Room List" "Hotel Staff" `
        "Hotel Staff views a table of all rooms with key details, amenities, inclusions, and availability status." `
        "System is running; database is accessible." `
        "Staff sees the current room inventory list. No data is modified." `
        "Staff navigates to Rooms in the navigation menu or visits /Rooms." `
        @(
            "1. Staff selects Rooms from the navigation bar."
            "2. System retrieves all rooms with amenities and inclusions from the database."
            "3. System displays the room list sorted by room number, showing room number, name, price, occupancy, amenities, inclusions, availability, and action links."
            "4. Staff reviews the list."
        ) `
        @(
            "A1 - No rooms exist: System displays 'No rooms yet. Create your first room to get started.'"
            "A2 - Success message: If a room was just created, edited, or deleted, system displays a green success alert."
        ) `
        @() `
        @()

    Add-UseCase "UC-02" "View Room Details" "Hotel Staff" `
        "Staff views the full profile of a single room including all attributes, amenities, and inclusions." `
        "The room exists in the database." `
        "Staff has viewed the room details. No data is modified." `
        "Staff clicks Details on a room in the list." `
        @(
            "1. Staff clicks Details for a room on the room list."
            "2. System retrieves the room by ID, including linked amenities and inclusions."
            "3. System displays room number, name, description, price, occupancy, beds, size, status, amenities, and inclusions."
            "4. Staff reviews the details and may click Edit or Back to List."
        ) `
        @() `
        @("E1 - Room not found: System returns HTTP 404 Not Found.") `
        @()

    Add-UseCase "UC-03" "Create Rooms (Bulk)" "Hotel Staff" `
        "Staff creates one or more rooms (up to 50) sharing the same type details but with unique room numbers." `
        "Staff is on the Create Rooms form; amenity and inclusion catalogs are loaded." `
        "One or more new room records are saved. Staff is redirected to the room list with a success message." `
        "Staff clicks Create Room on the room list." `
        @(
            "1. Staff clicks Create Room on the room list."
            "2. System displays the Create Rooms form."
            "3. Staff enters shared room details (name, price, occupancy, beds, size, availability)."
            "4. Staff enters How Many Rooms (e.g. 3)."
            "5. System dynamically shows room number input fields for each room."
            "6. Staff enters a unique room number for each field."
            "7. Staff optionally selects amenities and inclusions."
            "8. Staff clicks Create Rooms."
            "9. System validates all fields and room number uniqueness."
            "10. System creates all rooms in a single transaction."
            "11. System redirects to room list with success message."
        ) `
        @(
            "A1 - Single room: Room count of 1 shows one room number field."
            "A2 - Add amenity during create: See UC-06."
            "A3 - Add inclusion during create: See UC-07."
        ) `
        @(
            "E1 - Validation failure: Form redisplays with error messages."
            "E2 - Duplicate room number: 'Room number already exists' error displayed."
            "E3 - Room count mismatch: 'Please assign a room number for all N room(s).'"
        ) `
        @(
            "BR-01: Room numbers must be unique across the hotel."
            "BR-02: Bulk create allows 1 to 50 rooms per submission."
            "BR-03: All rooms in one submission share the same type details."
        )

    Add-UseCase "UC-04" "Edit Room" "Hotel Staff" `
        "Staff updates an existing room's details, pricing, availability, amenities, and inclusions." `
        "The room exists in the database." `
        "Room record is updated with UpdatedAt timestamp. Staff is redirected to room list." `
        "Staff clicks Edit on a room in the list or details page." `
        @(
            "1. Staff clicks Edit for a room."
            "2. System loads the room and populates the edit form."
            "3. System loads active amenities and inclusions with current selections."
            "4. Staff modifies desired fields."
            "5. Staff clicks Save."
            "6. System validates and verifies room number uniqueness (excluding current room)."
            "7. System updates room and replaces amenity/inclusion links."
            "8. System redirects to room list with success message."
        ) `
        @() `
        @(
            "E1 - Room not found: HTTP 404."
            "E2 - ID tampering: HTTP 400 if route ID does not match form ID."
            "E3 - Duplicate room number: Error displayed."
            "E4 - Validation failure: Form redisplays with errors."
        ) `
        @()

    Add-UseCase "UC-05" "Delete Room" "Hotel Staff" `
        "Staff permanently removes a room from the system after confirmation." `
        "The room exists in the database." `
        "Room and its amenity/inclusion links are deleted. Staff is redirected to room list." `
        "Staff clicks Delete on a room in the list." `
        @(
            "1. Staff clicks Delete for a room."
            "2. System displays confirmation page with room details."
            "3. Staff reviews the information."
            "4. Staff clicks Delete to confirm."
            "5. System deletes room and cascades junction link removal."
            "6. System redirects to room list with success message."
        ) `
        @("A1 - Cancel: Staff clicks Cancel and returns to list without changes.") `
        @("E1 - Room not found: HTTP 404.") `
        @("BR-04: Deleting a room removes junction links but not catalog amenities/inclusions.")

    Add-UseCase "UC-06" "Add New Amenity" "Hotel Staff" `
        "Staff adds a new amenity to the shared catalog while creating or editing a room." `
        "Staff is on the Create or Edit room form." `
        "New amenity is saved and appears in the checkbox list, pre-selected." `
        "Staff types a name and clicks Add or presses Enter." `
        @(
            "1. Staff enters amenity name in the add field."
            "2. Staff clicks Add or presses Enter."
            "3. System sends AJAX POST to /Rooms/AddAmenity."
            "4. System validates name (required, max 100 chars)."
            "5. System creates new amenity or reuses existing by name."
            "6. Client appends checked checkbox to amenity list."
        ) `
        @() `
        @(
            "E1 - Empty name: Client displays 'Enter an amenity name.'"
            "E2 - Validation failure: HTTP 400 with error message."
        ) `
        @("BR-05: Duplicate names reuse existing record instead of creating duplicate.")

    Add-UseCase "UC-07" "Add New Inclusion" "Hotel Staff" `
        "Staff adds a new inclusion to the shared catalog while creating or editing a room." `
        "Staff is on the Create or Edit room form." `
        "New inclusion is saved and appears in the checkbox list, pre-selected." `
        "Staff types a name and clicks Add or presses Enter." `
        @(
            "1. Staff enters inclusion name."
            "2. Staff clicks Add or presses Enter."
            "3. System sends AJAX POST to /Rooms/AddInclusion."
            "4. System validates and saves (same logic as UC-06)."
            "5. Client appends checked checkbox to inclusion list."
        ) `
        @() `
        @("E1 - Empty name or validation failure (same as UC-06).") `
        @()

    Add-UseCase "UC-08" "Assign Amenities to Room" "Hotel Staff" `
        "Staff selects amenities from the catalog to associate with a room during create or edit." `
        "Amenity catalog is loaded; staff is on Create or Edit form." `
        "Selected amenities are linked via RoomAmenity junction records on save." `
        "Staff checks/unchecks amenity checkboxes." `
        @(
            "1. Staff views active amenities as checkboxes."
            "2. Staff checks desired amenities."
            "3. On submit, system creates RoomAmenity records."
            "4. Room displays assigned amenities on list and details views."
        ) `
        @() `
        @() `
        @(
            "BR-06: Many-to-many relationship between Room and Amenity."
            "BR-07: Only active amenities appear in the picker."
            "BR-08: Amenity delete is RESTRICT if rooms reference it."
        )

    Add-UseCase "UC-09" "Assign Inclusions to Room" "Hotel Staff" `
        "Staff selects inclusions to bundle with a room during create or edit." `
        "Inclusion catalog is loaded; staff is on Create or Edit form." `
        "Selected inclusions are linked via RoomInclusion junction records on save." `
        "Staff checks/unchecks inclusion checkboxes." `
        @(
            "1. Staff views active inclusions as checkboxes."
            "2. Staff checks desired inclusions."
            "3. On submit, system creates RoomInclusion records."
            "4. Room displays assigned inclusions on list and details views."
        ) `
        @() `
        @() `
        @("BR-09: Same many-to-many rules as amenities (RoomInclusion junction).")

    Add-UseCase "UC-10" "Validate Room Data" "System" `
        "System validates all room input before persistence using FluentValidation, DataAnnotations, and controller checks." `
        "Staff has submitted a create or edit form." `
        "Data is validated; invalid data is rejected with messages." `
        "Included automatically on every create or edit submission." `
        @(
            "1. Controller receives form data."
            "2. DataAnnotations validate ViewModel."
            "3. Controller performs additional checks (room count, uniqueness)."
            "4. FluentValidation validates DTO in Application layer."
            "5. If valid, flow continues to UC-11. If invalid, errors returned to user."
        ) `
        @() `
        @() `
        @(
            "Name: Required, max 100 characters."
            "Room Number: Required, max 20, unique."
            "Price: Required, greater than 0."
            "Max Occupancy: 1 to 20. Bed Count: 1 to 10."
            "Bulk: 1 to 50 rooms; all numbers unique and non-empty."
        )

    Add-UseCase "UC-11" "Persist to Database" "System" `
        "System saves validated room data through Repository, Unit of Work, and EF Core." `
        "Data has passed validation (UC-10)." `
        "Data is committed to SQL Server database." `
        "Included after successful validation on write operations." `
        @(
            "1. Application service receives validated DTO."
            "2. Service maps DTO to domain entity."
            "3. Service applies amenity/inclusion links."
            "4. Repository adds/updates/deletes entity."
            "5. Unit of Work calls SaveChangesAsync in a single transaction."
            "6. Result returned to controller."
        ) `
        @() `
        @() `
        @()

    Add-Heading1("4. Use Case Relationships")
    Add-Table @("Relationship", "From", "To", "Type") @(
        ,@("Include", "UC-03 Create Rooms", "UC-10 Validate", "System always validates before save")
        ,@("Include", "UC-04 Edit Room", "UC-10 Validate", "System always validates before save")
        ,@("Include", "UC-10 Validate", "UC-11 Persist", "Validation precedes persistence")
        ,@("Extend", "UC-03 Create Rooms", "UC-06 Add Amenity", "Optional during create")
        ,@("Extend", "UC-03 Create Rooms", "UC-07 Add Inclusion", "Optional during create")
        ,@("Extend", "UC-03 Create Rooms", "UC-08 Assign Amenities", "Optional selection")
        ,@("Extend", "UC-03 Create Rooms", "UC-09 Assign Inclusions", "Optional selection")
        ,@("Association", "UC-04 Edit Room", "UC-06, UC-07, UC-08, UC-09", "Same optional actions on edit")
    )

    Add-Heading1("5. Business Rules Summary")
    Add-Body("1. Room numbers must be unique across the entire hotel.")
    Add-Body("2. Bulk create allows 1 to 50 rooms per submission with shared type details.")
    Add-Body("3. Amenities and inclusions are shared catalogs.")
    Add-Body("4. Duplicate amenity/inclusion names reuse the existing record.")
    Add-Body("5. Deleting a room removes junction links but not catalog entries.")
    Add-Body("6. Deleting an amenity/inclusion is blocked if any room references it.")

    Add-Heading1("6. Entity Overview (ERD Reference)")
    Add-Table @("Entity", "Description", "Key Fields") @(
        ,@("Room", "Physical hotel room", "Id (PK), RoomNumber (UK), Name, PricePerNight")
        ,@("Amenity", "Shared room feature catalog", "Id (PK), Name, IsActive")
        ,@("Inclusion", "Shared bundled service catalog", "Id (PK), Name, IsActive")
        ,@("RoomAmenity", "Junction: Room to Amenity", "RoomId + AmenityId (PK)")
        ,@("RoomInclusion", "Junction: Room to Inclusion", "RoomId + InclusionId (PK)")
    )

    if (Test-Path $outputPath) { Remove-Item $outputPath -Force }
    $doc.SaveAs2($outputPath, 16) | Out-Null
    Write-Output "Created: $outputPath"
}
finally {
    if ($doc) { $doc.Close($false) | Out-Null }
    if ($word) { $word.Quit() | Out-Null }
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
