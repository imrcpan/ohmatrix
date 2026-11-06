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
}
