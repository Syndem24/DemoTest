using System.Text;

namespace TestingDemo.Services;

/// <summary>
/// HTTP header values must be ASCII. En-dashes in export messages caused
/// "Invalid non-ASCII or control character in header: 0x2013" and aborted the file download.
/// </summary>
public static class HttpHeaderText
{
    public static string Ascii(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (ch is '\r' or '\n')
            {
                continue;
            }

            if (ch is '–' or '—' or '−')
            {
                builder.Append('-');
                continue;
            }

            if (ch is '“' or '”')
            {
                builder.Append('"');
                continue;
            }

            if (ch is '‘' or '’')
            {
                builder.Append('\'');
                continue;
            }

            if (ch is '₱')
            {
                builder.Append("PHP");
                continue;
            }

            if (ch < 32 || ch > 126)
            {
                builder.Append(' ');
                continue;
            }

            builder.Append(ch);
        }

        return builder.ToString().Trim();
    }
}
