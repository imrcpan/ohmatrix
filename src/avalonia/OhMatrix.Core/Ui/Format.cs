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

    /// <summary>A size in bytes as people read it: <c>12 KB</c>, <c>3.4 MB</c>; empty for none.</summary>
    /// <summary>A length of time as <c>m:ss</c>, or <c>h:mm:ss</c> from an hour.</summary>
    public static string Duration(TimeSpan t)
    {
        var total = (long)Math.Round(t.TotalSeconds);
        var h = total / 3600;
        var m = total % 3600 / 60;
        var sec = total % 60;
        return h > 0 ? $"{h}:{m:00}:{sec:00}" : $"{m}:{sec:00}";
    }

    public static string Bytes(long n)
    {
        if (n <= 0)
            return "";
        string[] units = ["B", "KB", "MB", "GB"];
        var i = 0;
        double v = n;
        while (v >= 1024 && i < units.Length - 1) {
            v /= 1024;
            i++;
        }

        return
            $"{(v >= 10 || i == 0 ? Math.Round(v).ToString(CultureInfo.InvariantCulture) : v.ToString("0.0", CultureInfo.InvariantCulture))} {units[i]}";
    }
}
