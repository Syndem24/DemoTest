using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestDepositCheckout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_QrPaymentIntent_XenditPaymentRequestId",
                table: "QrPaymentIntent");

            migrationBuilder.AlterColumn<string>(
                name: "XenditPaymentRequestId",
                table: "QrPaymentIntent",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(64)",
                oldMaxLength: 64);

            migrationBuilder.AlterColumn<string>(
                name: "QrString",
                table: "QrPaymentIntent",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<int>(
                name: "Channel",
                table: "QrPaymentIntent",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "CheckoutUrl",
                table: "QrPaymentIntent",
                type: "nvarchar(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "EventType",
                table: "QrPaymentIntent",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "XenditInvoiceId",
                table: "QrPaymentIntent",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DepositDueAtUtc",
                table: "Booking",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GuestPayToken",
                table: "Booking",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_QrPaymentIntent_XenditInvoiceId",
                table: "QrPaymentIntent",
                column: "XenditInvoiceId",
                unique: true,
                filter: "[XenditInvoiceId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_QrPaymentIntent_XenditPaymentRequestId",
                table: "QrPaymentIntent",
                column: "XenditPaymentRequestId",
                unique: true,
                filter: "[XenditPaymentRequestId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Booking_GuestPayToken",
                table: "Booking",
                column: "GuestPayToken",
                unique: true,
                filter: "[GuestPayToken] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_QrPaymentIntent_XenditInvoiceId",
                table: "QrPaymentIntent");

            migrationBuilder.DropIndex(
                name: "IX_QrPaymentIntent_XenditPaymentRequestId",
                table: "QrPaymentIntent");

            migrationBuilder.DropIndex(
                name: "IX_Booking_GuestPayToken",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "Channel",
                table: "QrPaymentIntent");

            migrationBuilder.DropColumn(
                name: "CheckoutUrl",
                table: "QrPaymentIntent");

            migrationBuilder.DropColumn(
                name: "EventType",
                table: "QrPaymentIntent");

            migrationBuilder.DropColumn(
                name: "XenditInvoiceId",
                table: "QrPaymentIntent");

            migrationBuilder.DropColumn(
                name: "DepositDueAtUtc",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "GuestPayToken",
                table: "Booking");

            migrationBuilder.AlterColumn<string>(
                name: "XenditPaymentRequestId",
                table: "QrPaymentIntent",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(64)",
                oldMaxLength: 64,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "QrString",
                table: "QrPaymentIntent",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_QrPaymentIntent_XenditPaymentRequestId",
                table: "QrPaymentIntent",
                column: "XenditPaymentRequestId",
                unique: true);
        }
    }
}
