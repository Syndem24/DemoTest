using System.Diagnostics;
using System.Globalization;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using FluentValidation;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Localization;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using QuestPDF.Infrastructure;
using TestingDemo.Data;
using TestingDemo.Hubs;
using TestingDemo.Middleware;
using TestingDemo.Models;
using TestingDemo.Services;
using TestingDemo.Validators;

try
{
    QuestPDF.Settings.License = LicenseType.Community;

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

    builder.Services.Configure<IdentityBootstrapOptions>(
        builder.Configuration.GetSection(IdentityBootstrapOptions.SectionName));

    builder.Services.AddControllersWithViews()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            options.JsonSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
            options.JsonSerializerOptions.Converters.Add(new UtcNullableDateTimeJsonConverter());
        });

    builder.Services.AddSignalR()
        .AddJsonProtocol(options =>
        {
            options.PayloadSerializerOptions.PropertyNamingPolicy =
                System.Text.Json.JsonNamingPolicy.CamelCase;
            options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter());
            options.PayloadSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
            options.PayloadSerializerOptions.Converters.Add(new UtcNullableDateTimeJsonConverter());
        });

    builder.Services.AddMemoryCache();
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
        options.AddPolicy("staff-password-reset", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true
                }));
        options.AddPolicy("staff-password-reset-verify", context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true
                }));
    });

    builder.Services.AddDistributedMemoryCache();
    builder.Services.AddSession(options =>
    {
        options.IdleTimeout = TimeSpan.FromMinutes(20);
        options.Cookie.HttpOnly = true;
        options.Cookie.IsEssential = true;
        options.Cookie.Name = "MoriHotel.Session";
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    });

    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

    builder.Services.AddDbContext<HotelBookingDbContext>(options =>
    {
        options.UseSqlServer(connectionString, sql =>
        {
            sql.EnableRetryOnFailure(3, TimeSpan.FromSeconds(3), null);
            sql.CommandTimeout(60);
        });
        options.ConfigureWarnings(warnings =>
            warnings.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.RelationalEventId.PendingModelChangesWarning));
    });

    builder.Services
        .AddIdentity<ApplicationUser, IdentityRole>(options =>
        {
            options.Password.RequiredLength = 12;
            options.Password.RequireDigit = true;
            options.Password.RequireLowercase = true;
            options.Password.RequireUppercase = true;
            options.Password.RequireNonAlphanumeric = true;
            options.User.RequireUniqueEmail = true;
            options.Lockout.AllowedForNewUsers = true;
            options.Lockout.MaxFailedAccessAttempts = 5;
            options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        })
        .AddUserStore<StaffAccountStore>()
        .AddRoleStore<StaffRoleStore>()
        .AddDefaultTokenProviders();

    builder.Services.Configure<DataProtectionTokenProviderOptions>(options =>
        options.TokenLifespan = TimeSpan.FromHours(1));

    builder.Services.ConfigureApplicationCookie(options =>
    {
        options.LoginPath = "/Account/Login";
        options.AccessDeniedPath = "/Account/Login";
        options.SlidingExpiration = true;
        options.ExpireTimeSpan = TimeSpan.FromHours(8);
        options.Cookie.HttpOnly = true;
        options.Cookie.Name = "MoriHotel.Auth";
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.Events.OnRedirectToLogin = context =>
        {
            if (IsApiOrHub(context.Request.Path))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }

            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            if (IsApiOrHub(context.Request.Path))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            }

            context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });

    builder.Services.AddSingleton<IConfigureNamedOptions<GoogleOptions>, ConfigureGoogleOptions>();
    builder.Services.AddScoped<IGoogleAuthSettings, GoogleAuthSettings>();

    builder.Services.AddAuthentication()
        .AddGoogle(options =>
        {
            // Non-empty placeholders satisfy OAuthOptions.Validate(); real values come from the vault.
            options.ClientId = GoogleAuthSettings.UnconfiguredClientId;
            options.ClientSecret = GoogleAuthSettings.UnconfiguredClientSecret;
            options.SaveTokens = false;
            options.CallbackPath = "/signin-google";
            options.ClaimActions.MapJsonKey("email_verified", "email_verified");

            // Default CorrelationCookie.SecurePolicy is Always — browsers drop it on plain HTTP
            // (this app runs http://localhost:5288 in Development). SameAsRequest keeps HTTPS secure.
            options.CorrelationCookie.Name = "MoriHotel.GoogleCorrelation";
            options.CorrelationCookie.HttpOnly = true;
            options.CorrelationCookie.IsEssential = true;
            options.CorrelationCookie.SameSite = SameSiteMode.Lax;
            options.CorrelationCookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;

            options.Events.OnRemoteFailure = context =>
            {
                context.HandleResponse();
                var factory = context.HttpContext.RequestServices.GetRequiredService<ITempDataDictionaryFactory>();
                var tempData = factory.GetTempData(context.HttpContext);
                tempData["Error"] = "Google sign-in was cancelled or could not be completed. Try Continue with Google again.";
                tempData.Save();
                context.Response.Redirect("/Account/Login");
                return Task.CompletedTask;
            };

            options.Events.OnRedirectToAuthorizationEndpoint = async context =>
            {
                var google = context.HttpContext.RequestServices.GetRequiredService<IGoogleAuthSettings>();
                var (id, secret) = await google.GetCredentialsAsync();
                if (!GoogleAuthSettings.IsUsableClientId(id) || !GoogleAuthSettings.IsUsableSecret(secret))
                {
                    context.Response.Redirect("/Account/Login");
                    return;
                }

                context.Options.ClientId = id!;
                context.Options.ClientSecret = secret!;
                context.RedirectUri = GoogleAuthSettings.ReplaceClientIdInAuthorizeUrl(context.RedirectUri, id!);
                context.RedirectUri = GoogleAuthSettings.SetAuthorizeQuery(
                    context.RedirectUri,
                    "prompt",
                    "select_account");
                context.Response.Redirect(context.RedirectUri);
            };
        });

    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("AdminManagerOnly", policy =>
            policy.RequireRole(AppRoles.AdminManager));
    });

    builder.Services.AddValidatorsFromAssemblyContaining<CreateRoomDtoValidator>();
    builder.Services.AddScoped<IGuestCatalogNotifier, GuestCatalogNotifier>();
    builder.Services.AddScoped<IAuditLogNotifier, AuditLogNotifier>();
    builder.Services.AddScoped<IRoomService, RoomService>();
    builder.Services.AddScoped<IBookingService, BookingService>();
    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<IPaymentService, PaymentService>();
    builder.Services.AddScoped<ISystemAuditRecorder, SystemAuditRecorder>();
    builder.Services.AddScoped<ISystemAuditQuery>(sp => (SystemAuditRecorder)sp.GetRequiredService<ISystemAuditRecorder>());
    builder.Services.AddScoped<ISystemFlushService, SystemFlushService>();
    builder.Services.AddSingleton<IPaymentReceiptStorage, LocalPaymentReceiptStorage>();
    builder.Services.Configure<AzureDocumentIntelligenceOptions>(
        builder.Configuration.GetSection(AzureDocumentIntelligenceOptions.SectionName));
    builder.Services.AddSingleton<OcrUsageTracker>();
    builder.Services.AddScoped<IReceiptOcrService, AzureReceiptOcrService>();
    builder.Services.AddHostedService<AutomaticCheckoutBackgroundService>();
    builder.Services.AddHostedService<OfferExpiryWarningBackgroundService>();
    builder.Services.AddScoped<IAdminManagerSeed, AdminManagerSeed>();
    builder.Services.AddSingleton<IGoogleVerificationTokenService, GoogleVerificationTokenService>();
    builder.Services.AddScoped<ISecureConfigStore, SecureConfigStore>();
    builder.Services.AddScoped<IStaffEmailSender, SmtpStaffEmailSender>();
    builder.Services.AddScoped<IStaffOnboardingEmailSender, SmtpStaffEmailSender>();
    builder.Services.AddScoped<IStaffPasswordResetCodeService, StaffPasswordResetCodeService>();
    builder.Services.AddScoped<IGeminiChatClient, GeminiChatClient>();
    builder.Services.AddScoped<IStaffAccountCreateService, StaffAccountCreateService>();
    builder.Services.AddScoped<ISpecialOfferService, SpecialOfferService>();
    builder.Services.AddScoped<IDashboardAnalyticsService, DashboardAnalyticsService>();
    builder.Services.AddScoped<IStaffShiftService, StaffShiftService>();
    builder.Services.AddScoped<IStayReviewService, StayReviewService>();

    builder.Services.AddResponseCompression(options =>
    {
        options.EnableForHttps = true;
        options.Providers.Add<Microsoft.AspNetCore.ResponseCompression.BrotliCompressionProvider>();
        options.Providers.Add<Microsoft.AspNetCore.ResponseCompression.GzipCompressionProvider>();
    });

    var app = builder.Build();

    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<HotelBookingDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>()
            .CreateLogger("DatabaseBootstrap");
        DatabaseBootstrap.ApplyMigrations(db, logger);

        var seed = scope.ServiceProvider.GetRequiredService<IAdminManagerSeed>();
        seed.EnsureAsync().GetAwaiter().GetResult();
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
    app.UseResponseCompression();
    app.UseRouting();
    app.UseSession();
    app.UseAuthentication();
    app.UseAuthorization();
    app.UseMiddleware<MustChangePasswordMiddleware>();
    app.UseStatusCodePagesWithReExecute("/Home/NotFoundPage");
    app.UseRateLimiter();
    app.MapStaticAssets();
    app.MapControllers();
    app.MapHub<BookingNotificationsHub>("/hubs/bookings");
    app.MapHub<GuestCatalogHub>("/hubs/guest-catalog");
    app.MapControllerRoute(
            name: "default",
            pattern: "{controller=Booking}/{action=Index}/{id?}")
        .WithStaticAssets();

    var publicBaseUrl = app.Configuration["PublicBaseUrl"]?.TrimEnd('/');
    var siteUrl = string.IsNullOrWhiteSpace(publicBaseUrl) ? "http://localhost:5288" : publicBaseUrl;

    Console.WriteLine();
    Console.WriteLine("========================================");
    Console.WriteLine("  Mori International Hotel is running");
    Console.WriteLine($"  Guest site: {siteUrl}");
    Console.WriteLine($"  Staff login: {siteUrl}/Account/Login");
    Console.WriteLine($"  Staff dashboard: {siteUrl}/Dashboard");
    Console.WriteLine($"  Admin rooms: {siteUrl}/Rooms");
    Console.WriteLine("  Keep this window/debug session open.");
    Console.WriteLine("========================================");
    Console.WriteLine();

    if (ShouldOpenBrowser(app.Environment))
    {
        app.Lifetime.ApplicationStarted.Register(() => TryOpenBrowser(siteUrl));
    }

    app.Run();
}
catch (Exception ex) when (ex is not HostAbortedException
    && ex.GetType().Name != "HostAbortedException")
{
    Console.Error.WriteLine();
    Console.Error.WriteLine("FATAL: App failed to start.");
    Console.Error.WriteLine(ex.ToString());
    Console.Error.WriteLine();
    if (ex is Microsoft.Data.SqlClient.SqlException sqlEx
        && (sqlEx.Number == 1857 || sqlEx.Message.Contains("already in use", StringComparison.OrdinalIgnoreCase)))
    {
        Console.Error.WriteLine("Database file is locked — usually a previous debug session is still running.");
        Console.Error.WriteLine("Stop debugging in Visual Studio (Shift+F5), or close any other TestingDemo/dotnet host.");
        Console.Error.WriteLine("Then run again. From repo root: .\\run.ps1 also stops stale processes on port 5288.");
    }
    else
    {
        Console.Error.WriteLine("Try: powershell -File ..\\scripts\\setup-new-device.ps1 -ResetDatabase");
        Console.Error.WriteLine("Then: .\\run.ps1");
    }
    if (Environment.UserInteractive)
    {
        Console.Error.WriteLine("Press Enter to close...");
        try { Console.ReadLine(); } catch { /* ignored */ }
    }

    Environment.ExitCode = 1;
}

static bool IsApiOrHub(PathString path) =>
    path.StartsWithSegments("/api") || path.StartsWithSegments("/hubs");

static bool ShouldOpenBrowser(IHostEnvironment environment)
{
    var flag = Environment.GetEnvironmentVariable("HOTEL_OPEN_BROWSER");
    return string.Equals(flag, "1", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(flag, "true", StringComparison.OrdinalIgnoreCase);
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
    catch
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd",
                Arguments = $"/c start {url}",
                CreateNoWindow = true,
                UseShellExecute = false
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Could not open browser automatically: {ex.Message}");
            Console.WriteLine($"Open manually in browser: {url}");
        }
    }
}

static CultureInfo CreatePesoCulture()
{
    foreach (var name in new[] { "en-PH", "fil-PH", "en-US" })
    {
        try
        {
            var culture = (CultureInfo)CultureInfo.GetCultureInfo(name).Clone();
            culture.NumberFormat.CurrencySymbol = "₱";
            return culture;
        }
        catch (CultureNotFoundException)
        {
        }
    }

    var invariant = (CultureInfo)CultureInfo.InvariantCulture.Clone();
    invariant.NumberFormat.CurrencySymbol = "₱";
    return invariant;
}
