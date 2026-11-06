using System.Globalization;

namespace OhMatrix.Core.Ui;

/// <summary>Times as the screens show them (<c>format.ts</c> of the React Native app).</summary>
public static class Format {
    private static CultureInfo Culture(string locale)
    {
        try {
            return CultureInfo.GetCultureInfo(locale);
        } catch (CultureNotFoundException) {
            return CultureInfo.InvariantCulture;
        }
    }

    /// <summary>The chat-list time: the clock today, the weekday within the week, a short date otherwise; empty if there was no activity.</summary>
    public static string ListTime(long ts, DateTimeOffset now, string locale,
        TimeZoneInfo? zone = null)
    {
        if (ts == 0)
            return "";
        zone ??= TimeZoneInfo.Local;
        var at = TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(ts), zone);
        var today = TimeZoneInfo.ConvertTime(now, zone);
        var days = (int)Math.Round((today.Date - at.Date).TotalDays);
        var culture = Culture(locale);
        if (days <= 0)
            return at.ToString("HH:mm", culture);
        if (days < 7)
            return at.ToString("ddd", culture);
        return at.ToString("yy/M/d", culture);
    }

    /// <summary>The clock of a message, 24 hours.</summary>
    public static string Clock(long ts, string locale, TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        return TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(ts), zone)
            .ToString("HH:mm", Culture(locale));
    }

    /// <summary>The label of a date divider: Today, Yesterday, the weekday within the week, otherwise the date (without the year in this year).</summary>
    public static string DayLabel(long ts, DateTimeOffset now, string locale,
        Func<string, string> t,
        TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        var at = TimeZoneInfo.ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(ts), zone);
        var today = TimeZoneInfo.ConvertTime(now, zone);
        var days = (int)Math.Round((today.Date - at.Date).TotalDays);
        var culture = Culture(locale);
        if (days <= 0)
            return t("today");
        if (days == 1)
            return t("yesterday");
        if (days < 7)
            return at.ToString("dddd", culture);
        return at.Year == today.Year
            ? at.ToString("m", culture)
            : at.ToString("D", culture);
    }
}
