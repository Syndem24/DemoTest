using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBookingPaymentOption : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "AmountDueNow",
                table: "Booking",
                type: "decimal(18,2)",
                precision: 18,
                scale: 2,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PaymentOption",
                table: "Booking",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Full");

            migrationBuilder.Sql(
                """
                UPDATE Booking
                SET PaymentOption = 'Full',
                    AmountDueNow = TotalAmount
                WHERE PaymentOption = '' OR AmountDueNow = 0;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AmountDueNow",
                table: "Booking");

            migrationBuilder.DropColumn(
                name: "PaymentOption",
                table: "Booking");
        }
    }
}
