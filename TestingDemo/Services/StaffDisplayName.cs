using System.Security.Claims;
using TestingDemo.Models;

namespace TestingDemo.Services;

public static class StaffDisplayName
{
  public static string FromUser(ApplicationUser? user, ClaimsPrincipal? principal = null)
  {
    var full = user?.FullName?.Trim();
    if (full is { Length: >= 2 })
      return full;

    var userName = user?.UserName?.Trim();
    if (userName is { Length: >= 2 })
      return userName;

    var identityName = principal?.Identity?.Name?.Trim();
    if (identityName is { Length: >= 2 })
      return identityName;

    return "Staff";
  }
}
