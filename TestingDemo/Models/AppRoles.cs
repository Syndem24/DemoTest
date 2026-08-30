namespace TestingDemo.Models;

public static class AppRoles
{
    public const string AdminManager = "AdminManager";
    public const string Receptionist = "Receptionist";
    public const string Guest = "Guest";

    public static readonly HashSet<string> StaffAssignable = new(StringComparer.Ordinal)
    {
        Receptionist,
        AdminManager
    };
}
