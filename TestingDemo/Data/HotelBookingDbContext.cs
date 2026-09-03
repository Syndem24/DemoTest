using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TestingDemo.Models;
using TestingDemo.Services;

namespace TestingDemo.Data;

public class HotelBookingDbContext : IdentityDbContext<ApplicationUser>
{
    private static readonly JsonSerializerOptions JsonOptions = new();
    private readonly IAuditLogNotifier? _auditNotifier;

    public HotelBookingDbContext(
        DbContextOptions<HotelBookingDbContext> options,
        IAuditLogNotifier? auditNotifier = null)
        : base(options)
    {
        _auditNotifier = auditNotifier;
    }
    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomType> RoomTypes => Set<RoomType>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingItem> BookingItems => Set<BookingItem>();
    public DbSet<BookingCharge> BookingCharges => Set<BookingCharge>();
    public DbSet<BookingRoomAssignment> BookingRoomAssignments => Set<BookingRoomAssignment>();
    public DbSet<SystemFlushLog> SystemFlushLogs => Set<SystemFlushLog>();
    public DbSet<SystemAuditLog> SystemAuditLogs => Set<SystemAuditLog>();
    public DbSet<PaymentRecord> PaymentRecords => Set<PaymentRecord>();
    public DbSet<SpecialOffer> SpecialOffers => Set<SpecialOffer>();
    public DbSet<SecureSetting> SecureSettings => Set<SecureSetting>();
    public DbSet<StaffPasswordResetCode> StaffPasswordResetCodes => Set<StaffPasswordResetCode>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Staff roles live on ApplicationUser.RoleId — join/claim tables were dropped.
        // Ignore before base so IdentityDbContext does not map them first (EF warning 10626).
        modelBuilder.Ignore<IdentityUserRole<string>>();
        modelBuilder.Ignore<IdentityUserClaim<string>>();
        modelBuilder.Ignore<IdentityRoleClaim<string>>();

        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<IdentityRole>().ToTable(StaffAuthSchema.RoleTable);
        modelBuilder.Entity<IdentityUserLogin<string>>().ToTable(StaffAuthSchema.ExternalLoginTable);
        modelBuilder.Entity<IdentityUserToken<string>>().ToTable(StaffAuthSchema.AuthTokenTable);

        modelBuilder.Entity<ApplicationUser>(entity =>
        {
            entity.ToTable(StaffAuthSchema.UserTable);
            entity.Property(e => e.FullName).HasMaxLength(120);
            entity.Property(e => e.Address).HasMaxLength(300);
            entity.Property(e => e.GoogleEmail).HasMaxLength(256);
            entity.Property(e => e.NormalizedGoogleEmail).HasMaxLength(256);
            entity.Property(e => e.GoogleVerificationStatus)
                .HasConversion<string>()
                .HasMaxLength(40);
            entity.HasIndex(e => e.NormalizedGoogleEmail)
                .IsUnique()
                .HasFilter("[NormalizedGoogleEmail] IS NOT NULL");
            entity.Property(e => e.RoleId).HasMaxLength(450);
            entity.HasIndex(e => e.RoleId);
            entity.HasOne<IdentityRole>()
                .WithMany()
                .HasForeignKey(e => e.RoleId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.Property(e => e.DashboardLayoutJson).HasColumnType("nvarchar(max)");
        });

        modelBuilder.Entity<StaffPasswordResetCode>(entity =>
        {
            entity.ToTable(StaffAuthSchema.PasswordResetCodeTable);
            entity.HasKey(e => e.Id);
            entity.Property(e => e.UserId).HasMaxLength(450).IsRequired();
            entity.Property(e => e.NormalizedEmail).HasMaxLength(256).IsRequired();
            entity.Property(e => e.CodeHash).HasMaxLength(128).IsRequired();
            entity.HasIndex(e => new { e.UserId, e.CreatedAtUtc });
            entity.HasIndex(e => new { e.NormalizedEmail, e.ExpiresAtUtc });
        });

        modelBuilder.Entity<SecureSetting>(entity =>
        {
            entity.ToTable("SecureSetting");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Key).HasMaxLength(80).IsRequired();
            entity.Property(e => e.Ciphertext).IsRequired();
            entity.HasIndex(e => e.Key).IsUnique();
        });

        modelBuilder.Entity<RoomType>(entity =>
        {
            entity.ToTable("RoomType");
            entity.HasKey(e => e.RoomTypeId);
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
            entity.Property(e => e.Description).HasMaxLength(5000);
            ConfigureStringList(entity.Property(e => e.Inclusions));
            ConfigureStringList(entity.Property(e => e.Images));
            entity.Property(e => e.PricePerNight).HasPrecision(18, 2);
        });

        modelBuilder.Entity<Room>(entity =>
        {
            entity.ToTable("Room");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RoomNumber).HasMaxLength(20).IsRequired();
            entity.HasIndex(e => e.RoomNumber).IsUnique();
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .HasMaxLength(20)
                .IsRequired();

            entity.HasOne(e => e.RoomType)
                .WithMany(t => t.Rooms)
                .HasForeignKey(e => e.RoomTypeId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Booking>(entity =>
        {
            entity.ToTable("Booking");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Reference).HasMaxLength(24).IsRequired();
            entity.HasIndex(e => e.Reference).IsUnique();
            entity.Property(e => e.GuestName).HasMaxLength(120).IsRequired();
            entity.Property(e => e.GuestEmail).HasMaxLength(254).IsRequired();
            entity.Property(e => e.GuestPhone).HasMaxLength(40).IsRequired();
            entity.Property(e => e.CheckInAtUtc).HasColumnType("datetime2");
            entity.Property(e => e.CheckoutTimeUtc).HasColumnType("datetime2");
            entity.Property(e => e.Kind)
                .HasConversion<string>()
                .HasMaxLength(20)
                .IsRequired();
            entity.Property(e => e.PaymentOption)
                .HasConversion<string>()
                .HasMaxLength(20)
                .IsRequired();
            entity.Property(e => e.Status)
                .HasConversion<string>()
                .HasMaxLength(20)
                .IsRequired();
            entity.Property(e => e.Channel)
                .HasConversion<string>()
                .HasMaxLength(30)
                .IsRequired();
            entity.Property(e => e.ArrivalDiscountRequest)
                .HasConversion<string>()
                .HasMaxLength(30)
                .IsRequired();
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
            entity.Property(e => e.AmountDueNow).HasPrecision(18, 2);
            entity.HasIndex(e => new { e.IsArchived, e.Status, e.CheckInAtUtc, e.CheckoutTimeUtc });
            entity.HasIndex(e => e.CreatedAtUtc);
            entity.HasOne(e => e.SpecialOffer)
                .WithMany()
                .HasForeignKey(e => e.SpecialOfferId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);
        });

        modelBuilder.Entity<SpecialOffer>(entity =>
        {
            entity.ToTable("SpecialOffer");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).HasMaxLength(160).IsRequired();
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Kind)
                .HasConversion<string>()
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(e => e.Channels).HasConversion<int>();
            entity.Property(e => e.RegularPricePerNight).HasPrecision(18, 2);
            entity.Property(e => e.PromoPricePerNight).HasPrecision(18, 2);
            entity.HasIndex(e => new { e.RoomTypeId, e.IsActive, e.StartsAtUtc, e.EndsAtUtc });
            entity.HasIndex(e => e.SortOrder);
            entity.HasOne(e => e.RoomType)
                .WithMany(t => t.SpecialOffers)
                .HasForeignKey(e => e.RoomTypeId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<BookingItem>(entity =>
        {
            entity.ToTable("BookingItem");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RoomTypeName).HasMaxLength(100).IsRequired();
            entity.Property(e => e.PricePerNight).HasPrecision(18, 2);
            entity.HasIndex(e => new { e.BookingId, e.RoomTypeId }).IsUnique();
            entity.HasOne(e => e.Booking)
                .WithMany(b => b.Items)
                .HasForeignKey(e => e.BookingId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.RoomType)
                .WithMany()
                .HasForeignKey(e => e.RoomTypeId)
                .OnDelete(DeleteBehavior.SetNull)
                .IsRequired(false);
        });

        modelBuilder.Entity<BookingRoomAssignment>(entity =>
        {
            entity.ToTable("BookingRoomAssignment");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.BookingItemId, e.RoomId }).IsUnique();
            entity.HasIndex(e => e.RoomId);
            entity.HasOne(e => e.BookingItem)
                .WithMany(item => item.RoomAssignments)
                .HasForeignKey(e => e.BookingItemId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Room)
                .WithMany()
                .HasForeignKey(e => e.RoomId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BookingCharge>(entity =>
        {
            entity.ToTable("BookingCharge");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ChargeType)
                .HasConversion<string>()
                .HasMaxLength(30)
                .IsRequired();
            entity.Property(e => e.Label).HasMaxLength(200).IsRequired();
            entity.Property(e => e.UnitAmount).HasPrecision(18, 2);
            entity.Property(e => e.Amount).HasPrecision(18, 2);
            entity.HasIndex(e => new { e.BookingId, e.ChargeType });
            entity.HasOne(e => e.Booking)
                .WithMany(b => b.Charges)
                .HasForeignKey(e => e.BookingId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<SystemFlushLog>(entity =>
        {
            entity.ToTable("SystemFlushLog");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Kind)
                .HasConversion<string>()
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(e => e.PerformedBy).HasMaxLength(120).IsRequired();
            entity.Property(e => e.FileName).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Summary).HasMaxLength(2000).IsRequired();
            entity.HasIndex(e => e.FlushedAtUtc);
            entity.HasIndex(e => new { e.Kind, e.FlushedAtUtc });
        });

        modelBuilder.Entity<SystemAuditLog>(entity =>
        {
            entity.ToTable("SystemAuditLog");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Intent)
                .HasConversion<string>()
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(e => e.Domain)
                .HasConversion<string>()
                .HasMaxLength(40)
                .IsRequired();
            entity.Property(e => e.Action).HasMaxLength(80).IsRequired();
            entity.Property(e => e.ActorUserId).HasMaxLength(450).IsRequired();
            entity.Property(e => e.ActorDisplayName).HasMaxLength(120).IsRequired();
            entity.Property(e => e.TargetType).HasMaxLength(40).IsRequired();
            entity.Property(e => e.TargetId).HasMaxLength(80).IsRequired();
            entity.Property(e => e.TargetLabel).HasMaxLength(200).IsRequired();
            entity.Property(e => e.Reason).HasMaxLength(500);
            entity.Property(e => e.Summary).HasMaxLength(500).IsRequired();
            entity.HasIndex(e => e.AtUtc);
            entity.HasIndex(e => new { e.Intent, e.AtUtc });
            entity.HasIndex(e => new { e.Domain, e.AtUtc });
            entity.HasIndex(e => new { e.TargetType, e.TargetId });
        });

        modelBuilder.Entity<PaymentRecord>(entity =>
        {
            entity.ToTable("PaymentRecord");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.ReceiptNumber).HasMaxLength(40).IsRequired();
            entity.HasIndex(e => e.ReceiptNumber).IsUnique();
            entity.Property(e => e.EventType).HasConversion<string>().HasMaxLength(30).IsRequired();
            entity.Property(e => e.Method).HasConversion<string>().HasMaxLength(30).IsRequired();
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(20).IsRequired();
            entity.Property(e => e.Amount).HasPrecision(18, 2);
            entity.Property(e => e.StayTotalAtPosting).HasPrecision(18, 2);
            entity.Property(e => e.BalanceAfter).HasPrecision(18, 2);
            entity.Property(e => e.ReceivedBy).HasMaxLength(120).IsRequired();
            entity.Property(e => e.ExternalReference).HasMaxLength(120);
            entity.Property(e => e.BankTransferReference).HasMaxLength(120);
            entity.Property(e => e.ReceiptImagePath).HasMaxLength(500);
            entity.Property(e => e.Notes).HasMaxLength(1000);
            entity.Property(e => e.VoidReason).HasMaxLength(500);
            entity.Property(e => e.VoidedBy).HasMaxLength(120);
            entity.HasIndex(e => e.PaidAtUtc);
            entity.HasIndex(e => new { e.BookingId, e.PaidAtUtc });
            entity.HasOne(e => e.Booking)
                .WithMany(b => b.PaymentRecords)
                .HasForeignKey(e => e.BookingId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }

    private static void ConfigureStringList(PropertyBuilder<List<string>> property)
    {
        property
            .HasConversion(
                v => JsonSerializer.Serialize(v, JsonOptions),
                v => string.IsNullOrWhiteSpace(v)
                    ? new List<string>()
                    : JsonSerializer.Deserialize<List<string>>(v, JsonOptions) ?? new List<string>())
            .HasColumnType("nvarchar(max)")
            .Metadata.SetValueComparer(new ValueComparer<List<string>>(
                (left, right) =>
                    (left == null && right == null) ||
                    (left != null && right != null && left.SequenceEqual(right, StringComparer.OrdinalIgnoreCase)),
                value => value == null
                    ? 0
                    : value.Aggregate(0, (hash, item) =>
                        HashCode.Combine(hash, StringComparer.OrdinalIgnoreCase.GetHashCode(item))),
                value => value == null ? new List<string>() : value.ToList()));
    }

    public override int SaveChanges()
    {
        var auditAdded = HasPendingAuditInserts();
        var count = base.SaveChanges();
        NotifyAuditIfNeeded(auditAdded);
        return count;
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var auditAdded = HasPendingAuditInserts();
        var count = await base.SaveChangesAsync(cancellationToken);
        await NotifyAuditIfNeededAsync(auditAdded, cancellationToken);
        return count;
    }

    private bool HasPendingAuditInserts() =>
        ChangeTracker.Entries<SystemAuditLog>().Any(entry => entry.State == EntityState.Added);

    private void NotifyAuditIfNeeded(bool auditAdded)
    {
        if (!auditAdded || _auditNotifier is null)
            return;

        try
        {
            _auditNotifier.NotifyChangedAsync().GetAwaiter().GetResult();
        }
        catch
        {
            // SignalR push should not fail the write.
        }
    }

    private async Task NotifyAuditIfNeededAsync(bool auditAdded, CancellationToken cancellationToken)
    {
        if (!auditAdded || _auditNotifier is null)
            return;

        try
        {
            await _auditNotifier.NotifyChangedAsync(cancellationToken);
        }
        catch
        {
            // SignalR push should not fail the write.
        }
    }
}
