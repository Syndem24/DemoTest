# Hotel Booking Demo

## Visual Studio fix (exit `0xffffffff`)

Visual Studio was stopping the app when the browser closed. Cursor does not do that — that is why Cursor looked fine.

**Do this once in Visual Studio:**

1. **Tools → Options → Projects and Solutions → Web Projects**
2. **Uncheck** “Stop debugger when browser window is closed, close browser when debugging stops”
3. Open `HotelBookingSystem.sln`
4. Green play button profile should be **TestingDemo**
5. Press **F5**
6. Browser opens **http://localhost:5288/Rooms** automatically

Keep the VS option above unchecked so closing the browser does not kill the server.

## Run without Visual Studio

```powershell
.\run.ps1
```

Open **http://localhost:5288/Rooms** and keep that terminal open.
