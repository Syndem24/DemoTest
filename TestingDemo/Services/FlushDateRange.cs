namespace TestingDemo.Services;

/// <summary>
/// Manila calendar range for data-retention exports (inclusive dates; both ends required).
/// </summary>
public readonly record struct FlushDateRange(DateTime? FromUtcInclusive, DateTime? ToUtcExclusive)
{
    public bool HasFilter => FromUtcInclusive.HasValue || ToUtcExclusive.HasValue;

    public static FlushDateRange FromManilaDates(DateOnly? fromDate, DateOnly? toDate)
    {
        if (!fromDate.HasValue || !toDate.HasValue)
        {
            throw new ArgumentException("Choose both From and To dates (Philippines) before exporting.");
        }

        if (fromDate.Value > toDate.Value)
        {
            throw new ArgumentException("Export “from” date must be on or before the “to” date.");
        }

        var fromLocal = DateTime.SpecifyKind(
            fromDate.Value.ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Unspecified);
        var toExclusiveLocal = DateTime.SpecifyKind(
            toDate.Value.AddDays(1).ToDateTime(TimeOnly.MinValue),
            DateTimeKind.Unspecified);

        return new FlushDateRange(
            PhilippinesTime.ToUtc(fromLocal),
            PhilippinesTime.ToUtc(toExclusiveLocal));
    }

    public string DescribeForSummary()
    {
        if (!HasFilter)
        {
            return string.Empty;
        }

        string Fmt(DateTime utc) =>
            PhilippinesTime.ToManila(utc).ToString("yyyy-MM-dd");

        if (FromUtcInclusive.HasValue && ToUtcExclusive.HasValue)
        {
            var toInclusive = ToUtcExclusive.Value.AddTicks(-1);
            return $" Date filter (PH): {Fmt(FromUtcInclusive.Value)} – {Fmt(toInclusive)}.";
        }

        if (FromUtcInclusive.HasValue)
        {
            return $" Date filter (PH): from {Fmt(FromUtcInclusive.Value)}.";
        }

        var endInclusive = ToUtcExclusive!.Value.AddTicks(-1);
        return $" Date filter (PH): through {Fmt(endInclusive)}.";
    }
}
