namespace TestingDemo.Models;

/// <summary>
/// Explicit Google ownership state. Do not infer from StaffAccountLogin alone.
/// </summary>
public enum GoogleVerificationStatus
{
    NotLinked = 0,
    PendingGoogleVerification = 1,
    GoogleVerified = 2
}
