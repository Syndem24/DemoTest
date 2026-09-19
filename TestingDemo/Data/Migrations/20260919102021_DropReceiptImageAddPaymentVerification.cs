using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class DropReceiptImageAddPaymentVerification : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // NOTE: This migration is intentionally minimal. Most schema drift in this
            // project is reconciled by DatabaseBootstrap Ensure* guards, so the EF
            // snapshot bundled unrelated bootstrap-managed changes into the scaffold.
            // Only the PaymentRecord changes belong here.
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.PaymentRecord', N'ReceiptImagePath') IS NOT NULL
                    ALTER TABLE [dbo].[PaymentRecord] DROP COLUMN [ReceiptImagePath];
                IF COL_LENGTH(N'dbo.PaymentRecord', N'VerifiedAtUtc') IS NULL
                    ALTER TABLE [dbo].[PaymentRecord] ADD [VerifiedAtUtc] datetime2 NULL;
                IF COL_LENGTH(N'dbo.PaymentRecord', N'VerifiedBy') IS NULL
                    ALTER TABLE [dbo].[PaymentRecord] ADD [VerifiedBy] nvarchar(120) NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF COL_LENGTH(N'dbo.PaymentRecord', N'VerifiedAtUtc') IS NOT NULL
                    ALTER TABLE [dbo].[PaymentRecord] DROP COLUMN [VerifiedAtUtc];
                IF COL_LENGTH(N'dbo.PaymentRecord', N'VerifiedBy') IS NOT NULL
                    ALTER TABLE [dbo].[PaymentRecord] DROP COLUMN [VerifiedBy];
                IF COL_LENGTH(N'dbo.PaymentRecord', N'ReceiptImagePath') IS NULL
                    ALTER TABLE [dbo].[PaymentRecord] ADD [ReceiptImagePath] nvarchar(500) NULL;
                """);
        }
    }
}
