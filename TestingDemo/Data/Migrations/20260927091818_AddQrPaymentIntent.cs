using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddQrPaymentIntent : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded: DatabaseBootstrap.EnsureQrPaymentIntentTable may already have
            // created this table on databases that ran before the migration existed.
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[QrPaymentIntent]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[QrPaymentIntent] (
                        [Id] int NOT NULL IDENTITY,
                        [BookingId] int NOT NULL,
                        [ReferenceId] nvarchar(64) NOT NULL,
                        [XenditPaymentRequestId] nvarchar(64) NOT NULL,
                        [XenditPaymentId] nvarchar(64) NULL,
                        [Amount] decimal(18,2) NOT NULL,
                        [Currency] nvarchar(3) NOT NULL,
                        [Status] nvarchar(20) NOT NULL,
                        [QrString] nvarchar(max) NOT NULL,
                        [ExpiresAtUtc] datetime2 NULL,
                        [PaidAtUtc] datetime2 NULL,
                        [PaymentRecordId] int NULL,
                        [CreatedBy] nvarchar(120) NOT NULL,
                        [CreatedAtUtc] datetime2 NOT NULL,
                        [UpdatedAtUtc] datetime2 NOT NULL,
                        [FailureCode] nvarchar(80) NULL,
                        [IsTestMode] bit NOT NULL,
                        CONSTRAINT [PK_QrPaymentIntent] PRIMARY KEY ([Id]),
                        CONSTRAINT [FK_QrPaymentIntent_Booking_BookingId]
                            FOREIGN KEY ([BookingId]) REFERENCES [dbo].[Booking] ([Id]),
                        CONSTRAINT [FK_QrPaymentIntent_PaymentRecord_PaymentRecordId]
                            FOREIGN KEY ([PaymentRecordId]) REFERENCES [dbo].[PaymentRecord] ([Id])
                            ON DELETE SET NULL
                    );
                    CREATE UNIQUE INDEX [IX_QrPaymentIntent_ReferenceId]
                        ON [dbo].[QrPaymentIntent] ([ReferenceId]);
                    CREATE UNIQUE INDEX [IX_QrPaymentIntent_XenditPaymentRequestId]
                        ON [dbo].[QrPaymentIntent] ([XenditPaymentRequestId]);
                    CREATE UNIQUE INDEX [IX_QrPaymentIntent_XenditPaymentId]
                        ON [dbo].[QrPaymentIntent] ([XenditPaymentId])
                        WHERE [XenditPaymentId] IS NOT NULL;
                    CREATE INDEX [IX_QrPaymentIntent_BookingId]
                        ON [dbo].[QrPaymentIntent] ([BookingId]);
                    CREATE INDEX [IX_QrPaymentIntent_PaymentRecordId]
                        ON [dbo].[QrPaymentIntent] ([PaymentRecordId]);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QrPaymentIntent");
        }
    }
}
