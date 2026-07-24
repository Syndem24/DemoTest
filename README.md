# Hotel Booking Demo

## Why Visual Studio dies after create (`ERR_CONNECTION_REFUSED` / `0xffffffff`)

Visual Studio was opening the browser in a way that **ties the debugger to that browser window**. After you create a room (especially with photos / file picker), VS thinks the browser closed and **stops the app**. Cursor does not do this.

**Fixed in the project:** the app opens **http://localhost:5288** itself. VS no longer uses `launchBrowser`.

### One-time Visual Studio setting (required)

1. **Tools → Options → Projects and Solutions → Web Projects**
2. **Uncheck** “Stop debugger when browser window is closed, close browser when debugging stops”
3. Prefer **Edge** or **Firefox** while debugging
4. Open `HotelBookingSystem.sln` → profile **TestingDemo** → **F5**
5. Browser opens to **http://localhost:5288** — leave debugging running

If it still stops, use **Ctrl+F5** or `.\run.ps1`.

## Run

- Visual Studio / Cursor **F5**, or `.\run.ps1`
- Site: **http://localhost:5288**
