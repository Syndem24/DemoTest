using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
using TestingDemo.Hubs;
using TestingDemo.Services;
using TestingDemo.Validators;

try
{
    var builder = WebApplication.CreateBuilder(args);

    var pesoCulture = CreatePesoCulture();
    CultureInfo.DefaultThreadCurrentCulture = pesoCulture;
    CultureInfo.DefaultThreadCurrentUICulture = pesoCulture;

    builder.Services.Configure<RequestLocalizationOptions>(options =>
    {
        options.DefaultRequestCulture = new RequestCulture(pesoCulture);
        options.SupportedCultures = new[] { pesoCulture };
        options.SupportedUICultures = new[] { pesoCulture };
    });

    builder.Services.AddControllersWithViews()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });

    builder.Services.AddSignalR()
        .AddJsonProtocol(options =>
        {
            options.PayloadSerializerOptions.PropertyNamingPolicy =
                System.Text.Json.JsonNamingPolicy.CamelCase;
            options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        });

    builder.Services.AddAntiforgery(options => options.HeaderName = "RequestVerificationToken");
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.AddPolicy("guest-bookings", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true
                }));
    });

    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

    builder.Services.AddDbContext<HotelBookingDbContext>(options =>
        options.UseSqlServer(connectionString));

    builder.Services.AddValidatorsFromAssemblyContaining<CreateRoomDtoValidator>();
    builder.Services.AddScoped<IRoomService, RoomService>();
    builder.Services.AddScoped<IBookingService, BookingService>();

    var app = builder.Build();

    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<HotelBookingDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>()
            .CreateLogger("DatabaseBootstrap");
        DatabaseBootstrap.ApplyMigrations(db, logger);
    }

    if (app.Environment.IsDevelopment())
    {
        app.UseDeveloperExceptionPage();
    }
    else
    {
        app.UseExceptionHandler("/Home/Error");
        app.UseHsts();
        app.UseHttpsRedirection();
    }

    app.UseRequestLocalization();
    app.UseRouting();
    app.UseRateLimiter();
    app.MapStaticAssets();
    app.MapControllers();
    app.MapHub<BookingNotificationsHub>("/hubs/bookings");
    app.MapControllerRoute(
            name: "default",
            pattern: "{controller=Booking}/{action=Index}/{id?}")
        .WithStaticAssets();

    const string siteUrl = "http://localhost:5288";

    Console.WriteLine();
    Console.WriteLine("========================================");
    Console.WriteLine("  Mori International Hotel is running");
    Console.WriteLine($"  Guest site: {siteUrl}");
    Console.WriteLine($"  Admin rooms: {siteUrl}/Rooms");
    Console.WriteLine("  Keep this window/debug session open.");
    Console.WriteLine("========================================");
    Console.WriteLine();

    // Open the browser from the app (not Visual Studio's launchBrowser).
    // VS "launchBrowser" ties the debugger to the browser window and often kills the
    // process (0xffffffff / ERR_CONNECTION_REFUSED) after create or photo pick.
    if (ShouldOpenBrowser(app.Environment))
    {
        app.Lifetime.ApplicationStarted.Register(() => TryOpenBrowser(siteUrl));
    }

    app.Run();
}
catch (Exception ex)
{
    Console.Error.WriteLine();
    Console.Error.WriteLine("FATAL: App failed to start.");
    Console.Error.WriteLine(ex.ToString());
    Console.Error.WriteLine();
    Console.Error.WriteLine("Try: powershell -File ..\\scripts\\setup-new-device.ps1 -ResetDatabase");
    Console.Error.WriteLine("Then: .\\run.ps1");
    if (Environment.UserInteractive)
    {
        Console.Error.WriteLine("Press Enter to close...");
        try { Console.ReadLine(); } catch { /* ignored */ }
    }

    Environment.ExitCode = 1;
}

static bool ShouldOpenBrowser(IHostEnvironment environment)
{
    if (!environment.IsDevelopment())
    {
        return false;
    }

    var flag = Environment.GetEnvironmentVariable("HOTEL_OPEN_BROWSER");
    if (string.Equals(flag, "0", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(flag, "false", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    // Default on in Development (also when HOTEL_OPEN_BROWSER=1).
    return true;
}

static void TryOpenBrowser(string url)
{
    try
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = url,
            UseShellExecute = true
        });
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Could not open browser automatically: {ex.Message}");
        Console.WriteLine($"Open manually: {url}");
    }
}

static CultureInfo CreatePesoCulture()
{
    foreach (var name in new[] { "en-PH", "fil-PH", "en-US" })
    {
        try
        {
            var culture = CultureInfo.GetCultureInfo(name);
            culture = (CultureInfo)culture.Clone();
            culture.NumberFormat.CurrencySymbol = "₱";
            return culture;
        }
        catch (CultureNotFoundException)
        {
            // Try next fallback — some Windows installs lack en-PH.
        }
    }

    var invariant = (CultureInfo)CultureInfo.InvariantCulture.Clone();
    invariant.NumberFormat.CurrencySymbol = "₱";
    return invariant;
}
