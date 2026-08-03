using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TestingDemo.Models;

namespace TestingDemo.Data;

public class HotelBookingDbContext : DbContext
{
    private static readonly JsonSerializerOptions JsonOptions = new();

    public HotelBookingDbContext(DbContextOptions<HotelBookingDbContext> options)
        : base(options)
    {
    }

    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<RoomType> RoomTypes => Set<RoomType>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingItem> BookingItems => Set<BookingItem>();
    public DbSet<AssignedRoom> AssignedRooms => Set<AssignedRoom>();
    public DbSet<StaffUser> StaffUsers => Set<StaffUser>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<RoomType>(entity =>
        {
            entity.ToTable("RoomType");
            entity.HasKey(e => e.RoomTypeId);
            entity.Property(e => e.RoomTypeId).HasColumnName("RoomTypeID");
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
            entity.Property(e => e.Description).HasMaxLength(5000);
            ConfigureStringList(entity.Property(e => e.Inclusions));
            ConfigureStringList(entity.Property(e => e.Images));
        });

        modelBuilder.Entity<Room>(entity =>
        {
            entity.ToTable("Room");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.RoomNumber).HasMaxLength(20).IsRequired();
            entity.HasIndex(e => e.RoomNumber).IsUnique();
            entity.Property(e => e.PricePerNight).HasPrecision(18, 2);
            entity.Property(e => e.RoomTypeId).HasColumnName("RoomTypeID");
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
            entity.Property(e => e.CheckIn).HasColumnType("date");
            entity.Property(e => e.CheckOut).HasColumnType("date");
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
            entity.Property(e => e.TotalAmount).HasPrecision(18, 2);
            entity.Property(e => e.AmountDueNow).HasPrecision(18, 2);
            entity.Property(e => e.RowVersion).IsRowVersion();
            entity.HasIndex(e => new { e.IsArchived, e.Status, e.CheckIn, e.CheckOut });
            entity.HasIndex(e => e.CreatedAtUtc);
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
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AssignedRoom>(entity =>
        {
            entity.ToTable("AssignedRoom");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.BookingItemId, e.RoomId }).IsUnique();
            entity.HasIndex(e => e.RoomId);
            entity.HasOne(e => e.BookingItem)
                .WithMany(item => item.AssignedRooms)
                .HasForeignKey(e => e.BookingItemId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.Room)
                .WithMany()
                .HasForeignKey(e => e.RoomId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StaffUser>(entity =>
        {
            entity.ToTable("StaffUser");
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Username).HasMaxLength(80).IsRequired();
            entity.HasIndex(e => e.Username).IsUnique();
            entity.Property(e => e.DisplayName).HasMaxLength(120).IsRequired();
            entity.Property(e => e.PasswordHash).HasMaxLength(500).IsRequired();
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
}
