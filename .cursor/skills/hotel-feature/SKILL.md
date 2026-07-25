---
name: hotel-feature
description: >-
  Scaffolds hotel booking features using existing MVC, services, and dual layouts.
  Use when adding pages, modules, booking flows, admin links, or new hotel system
  features in this repo.
---

# Hotel feature workflow

## Before coding
1. Identify surface: **admin** (`_Layout`) vs **customer** (`_CustomerLayout`)
2. Reuse `IRoomService` / existing models before creating new ones
3. Default to UI-only unless user says save/persist/API

## Checklist
- [ ] Controller action + view (or API if JSON needed)
- [ ] ViewModel only if the view needs shaped data
- [ ] Styles in existing CSS file for that surface
- [ ] Nav link only if user needs discovery (sidebar or guest nav)
- [ ] Available rooms filter uses `RoomStatus.Available`
- [ ] Build if C# files changed

## File map
| Need | Put it here |
|------|-------------|
| Customer page | `Controllers/*Controller.cs`, `Views/*/` |
| Customer chrome | `Views/Shared/_CustomerLayout.cshtml` |
| Admin chrome | `Views/Shared/_Layout.cshtml` |
| Room CRUD/API | `RoomsController`, `RoomsApiController`, `Services/RoomService` |
| Customer styles/JS | `wwwroot/css/booking.css`, `wwwroot/js/booking-ui.js` |
| Room SPA | `TestingDemo/ClientApp/src/` |

## Done means
Feature matches request, uses existing palette/patterns, and is testable via a clear URL or click path.
