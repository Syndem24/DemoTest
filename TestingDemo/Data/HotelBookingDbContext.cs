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

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<RoomType>(entity =>
        {
            entity.ToTable("RoomType");
            entity.HasKey(e => e.RoomTypeId);
            entity.Property(e => e.RoomTypeId).HasColumnName("RoomTypeID");
            entity.Property(e => e.TypeName).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.TypeName).IsUnique();
            entity.Property(e => e.Description).HasMaxLength(1000);
            ConfigureStringList(entity.Property(e => e.Inclusions));
            ConfigureCustomCategories(entity.Property(e => e.CustomCategories));
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

    private static void ConfigureCustomCategories(PropertyBuilder<List<CustomInclusionCategory>> property)
    {
        property
            .HasConversion(
                v => JsonSerializer.Serialize(v ?? new List<CustomInclusionCategory>(), JsonOptions),
                v => string.IsNullOrWhiteSpace(v)
                    ? new List<CustomInclusionCategory>()
                    : JsonSerializer.Deserialize<List<CustomInclusionCategory>>(v, JsonOptions)
                      ?? new List<CustomInclusionCategory>())
            .HasColumnType("nvarchar(max)")
            .Metadata.SetValueComparer(new ValueComparer<List<CustomInclusionCategory>>(
                (left, right) =>
                    JsonSerializer.Serialize(left ?? new List<CustomInclusionCategory>(), JsonOptions)
                    == JsonSerializer.Serialize(right ?? new List<CustomInclusionCategory>(), JsonOptions),
                value => JsonSerializer.Serialize(value ?? new List<CustomInclusionCategory>(), JsonOptions).GetHashCode(),
                value => value == null
                    ? new List<CustomInclusionCategory>()
                    : value.Select(c => new CustomInclusionCategory
                    {
                        Name = c.Name,
                        Items = c.Items == null ? new List<string>() : c.Items.ToList()
                    }).ToList()));
    }
}
