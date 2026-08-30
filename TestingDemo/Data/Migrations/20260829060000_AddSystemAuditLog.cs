using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TestingDemo.Data;

#nullable disable

namespace TestingDemo.Data.Migrations
{
    [DbContext(typeof(HotelBookingDbContext))]
    [Migration("20260829060000_AddSystemAuditLog")]
    public partial class AddSystemAuditLog : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[SystemAuditLog]', N'U') IS NULL
                BEGIN
                    CREATE TABLE [dbo].[SystemAuditLog] (
                        [Id] bigint NOT NULL IDENTITY,
                        [AtUtc] datetime2 NOT NULL,
                        [Intent] nvarchar(40) NOT NULL,
                        [Domain] nvarchar(40) NOT NULL,
                        [Action] nvarchar(80) NOT NULL,
                        [ActorUserId] nvarchar(450) NOT NULL,
                        [ActorDisplayName] nvarchar(120) NOT NULL,
                        [TargetType] nvarchar(40) NOT NULL,
                        [TargetId] nvarchar(80) NOT NULL,
                        [TargetLabel] nvarchar(200) NOT NULL,
                        [Reason] nvarchar(500) NULL,
                        [Summary] nvarchar(500) NOT NULL,
                        CONSTRAINT [PK_SystemAuditLog] PRIMARY KEY ([Id])
                    );
                    CREATE INDEX [IX_SystemAuditLog_AtUtc]
                        ON [dbo].[SystemAuditLog] ([AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_Intent_AtUtc]
                        ON [dbo].[SystemAuditLog] ([Intent], [AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_Domain_AtUtc]
                        ON [dbo].[SystemAuditLog] ([Domain], [AtUtc] DESC);
                    CREATE INDEX [IX_SystemAuditLog_TargetType_TargetId]
                        ON [dbo].[SystemAuditLog] ([TargetType], [TargetId]);
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF OBJECT_ID(N'[dbo].[SystemAuditLog]', N'U') IS NOT NULL
                    DROP TABLE [dbo].[SystemAuditLog];
                """);
        }
    }
}
