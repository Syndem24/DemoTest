---
name: room-management
description: >-
  Works on admin Room Management (MVC + React SPA), room types, availability, and
  API payloads that feed the customer booking page. Use when editing rooms, room
  types, ClientApp, RoomsApi, or availability counts.
---

# Room management skill

## Read first
- `ClientApp/src/App.tsx`, `types.ts`, `api.ts`
- `Controllers/RoomsController.cs`, `RoomsApiController.cs`
- `Services/RoomService.cs`, `Models/Room*.cs`
- `Views/Rooms/`

## Rules
- React SPA is admin-only Room Management
- Mutations prefer existing MVC form posts unless user asks API writes
- `RoomStatus.Available` is what customer Booking consumes
- Keep React styles in `ClientApp/src/styles.css` aligned with navy/teal
- After SPA changes, rebuild ClientApp unless `SkipSpaBuild` is intentional

## Availability contract
Customer booking lists rooms/types where status is Available.
If changing status behavior, update Booking filter and admin UI consistently.

## Verify
- Admin `/Rooms` still loads list/types
- `/api/rooms` returns expected shape
- `/Booking` reflects available rooms after data changes
