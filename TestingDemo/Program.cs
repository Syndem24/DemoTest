using System.Globalization;
using FluentValidation;
using Microsoft.AspNetCore.Localization;
using Microsoft.EntityFrameworkCore;
using TestingDemo.Data;
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
        });

    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

    builder.Services.AddDbContext<HotelBookingDbContext>(options =>
        options.UseSqlServer(connectionString));

    builder.Services.AddValidatorsFromAssemblyContaining<CreateRoomDtoValidator>();
    builder.Services.AddScoped<IRoomService, RoomService>();

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
    app.UseAuthorization();
    app.MapStaticAssets();
    app.MapControllers();
    app.MapControllerRoute(
            name: "default",
            pattern: "{controller=Home}/{action=Index}/{id?}")
        .WithStaticAssets();

    Console.WriteLine();
    Console.WriteLine("========================================");
    Console.WriteLine("  Hotel Booking is running");
    Console.WriteLine("  Open: http://localhost:5288/Rooms");
    Console.WriteLine("  Keep this window/debug session open.");
    Console.WriteLine("========================================");
    Console.WriteLine();

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
