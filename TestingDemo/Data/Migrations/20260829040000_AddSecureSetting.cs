using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260829040000_AddSecureSetting")]
    public partial class AddSecureSetting : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[SecureSetting]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[SecureSetting] (
                        [Id] int NOT NULL IDENTITY,
                        [Key] nvarchar(80) NOT NULL,
                        [Ciphertext] nvarchar(max) NOT NULL,
                        [UpdatedUtc] datetime2 NOT NULL,
                        CONSTRAINT [PK_SecureSetting] PRIMARY KEY ([Id])
                    );
                    CREATE UNIQUE INDEX [IX_SecureSetting_Key]
                        ON [dbo].[SecureSetting] ([Key]);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[SecureSetting]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[SecureSetting];
                """);
        }
    }
}
