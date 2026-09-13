namespace TestingDemo.ViewModels;

public sealed class StatusErrorPageModel
{
    public int StatusCode { get; init; } = 404;
    public string Title { get; init; } = "Nothing's here";
    public string Headline { get; init; } = "Nothing's here";
    public string Description { get; init; } =
        "The page or room you are searching for doesn't exist, has been relocated, or is temporarily unavailable.";
    public string BadgeLabel { get; init; } = "HTTP Status 404";

    public static StatusErrorPageModel ForStatus(int statusCode) => statusCode switch
    {
        400 => new StatusErrorPageModel
        {
            StatusCode = 400,
            Title = "400 - Bad request",
            BadgeLabel = "HTTP Status 400",
            Headline = "Bad request",
            Description =
                "We couldn't handle that request. Check the link or form details and try again."
        },
        401 => new StatusErrorPageModel
        {
            StatusCode = 401,
            Title = "401 - Sign in required",
            BadgeLabel = "HTTP Status 401",
            Headline = "Sign in required",
            Description =
                "You need to sign in before opening this page. Use Sign In or Join, then try again."
        },
        403 => new StatusErrorPageModel
        {
            StatusCode = 403,
            Title = "403 - Access denied",
            BadgeLabel = "HTTP Status 403",
            Headline = "Access denied",
            Description =
                "Your account doesn't have permission for this page. Contact hotel staff if you think that is wrong."
        },
        500 => new StatusErrorPageModel
        {
            StatusCode = 500,
            Title = "500 - Something went wrong",
            BadgeLabel = "HTTP Status 500",
            Headline = "Something went wrong",
            Description =
                "The hotel site hit an unexpected problem and couldn't finish this request. Please try again in a moment."
        },
        503 => new StatusErrorPageModel
        {
            StatusCode = 503,
            Title = "503 - Temporarily unavailable",
            BadgeLabel = "HTTP Status 503",
            Headline = "Temporarily unavailable",
            Description =
                "This service is busy or offline right now. Please wait a bit and try again."
        },
        _ => new StatusErrorPageModel
        {
            StatusCode = 404,
            Title = "404 - Nothing's here",
            BadgeLabel = "HTTP Status 404",
            Headline = "Nothing's here",
            Description =
                "The page or room you are searching for doesn't exist, has been relocated, or is temporarily unavailable."
        }
    };
}
