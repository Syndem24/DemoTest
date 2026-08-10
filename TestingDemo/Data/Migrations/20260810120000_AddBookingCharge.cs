using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260810120000_AddBookingCharge")]
    public partial class AddBookingCharge : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[BookingCharge]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[BookingCharge] (
                        [Id] int NOT NULL IDENTITY,
                        [BookingId] int NOT NULL,
                        [ChargeType] nvarchar(30) NOT NULL,
                        [Label] nvarchar(200) NOT NULL,
                        [Quantity] int NOT NULL,
                        [Nights] int NOT NULL,
                        [UnitAmount] decimal(18,2) NOT NULL,
                        [Amount] decimal(18,2) NOT NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_BookingCharge] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_BookingCharge_Booking_BookingId]
                            FOREIGN KEY ([BookingId]) REFERENCES [dbo].[Booking] ([Id]) ON DELETE CASCADE
                    );
                    CREATE INDEX [IX_BookingCharge_BookingId_ChargeType]
                        ON [dbo].[BookingCharge] ([BookingId], [ChargeType]);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[BookingCharge]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[BookingCharge];
                """);
        }
    }
}
