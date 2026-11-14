using System.Globalization;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Support;

/// <summary>Times as the screens show them (<c>format.ts</c> of the React Native app).</summary>
public static class Format {
    private static readonly Logger logger = Logger.GetDefault();

    private static CultureInfo Culture(string locale)
    {
        try {
            return CultureInfo.GetCultureInfo(locale);
        } catch (CultureNotFoundException e) {
            logger.Exception($"find the culture {locale}", e);
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
        var at =
            TimeZoneInfo.ConvertTime(
                DateTimeOffset.FromUnixTimeMilliseconds(ts), zone);
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
    public static string Clock(long ts, string locale,
        TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        return TimeZoneInfo
            .ConvertTime(DateTimeOffset.FromUnixTimeMilliseconds(ts), zone)
            .ToString("HH:mm", Culture(locale));
    }

    /// <summary>The label of a date divider: Today, Yesterday, the weekday within the week, otherwise the date (without the year in this year).</summary>
    public static string DayLabel(long ts, DateTimeOffset now, string locale,
        Func<string, string> t,
        TimeZoneInfo? zone = null)
    {
        zone ??= TimeZoneInfo.Local;
        var at =
            TimeZoneInfo.ConvertTime(
                DateTimeOffset.FromUnixTimeMilliseconds(ts), zone);
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
    private enum Unit {
        Minute,
        Hour,
        Day,
    }

    private static readonly string[][] RuUnits = [
        ["минуту", "минуты", "минут"],
        ["час", "часа", "часов"],
        ["день", "дня", "дней"],
    ];

    // The word of the unit, with no array made to choose from.
    private static string Pick(int unit, string minute, string hour,
        string day) => unit switch {
        0 => minute,
        1 => hour,
        _ => day,
    };

    private static string Ago(string locale, int n, Unit unit)
    {
        var i = (int)unit;

        string Plural(string one, string many)
        {
            return n == 1 ? one : many;
        }

        var ru = (n % 10 == 1 && n % 100 != 11) ? 0
            : (n % 10 is >= 2 and <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1
            : 2;
        return locale switch {
            "zh-CN" => $"{n}{Pick(i, "分钟", "小时", "天")}前",
            "zh-TW" => $"{n}{Pick(i, "分鐘", "小時", "天")}前",
            "es" =>
                $"hace {n} {Pick(i, Plural("minuto", "minutos"), Plural("hora", "horas"), Plural("día", "días"))}",
            "fr" =>
                $"il y a {n} {Pick(i, n > 1 ? "minutes" : "minute", n > 1 ? "heures" : "heure", n > 1 ? "jours" : "jour")}",
            "de" =>
                $"vor {n} {Pick(i, Plural("Minute", "Minuten"), Plural("Stunde", "Stunden"), Plural("Tag", "Tagen"))}",
            "pt" =>
                $"há {n} {Pick(i, Plural("minuto", "minutos"), Plural("hora", "horas"), Plural("dia", "dias"))}",
            "it" =>
                $"{n} {Pick(i, Plural("minuto", "minuti"), Plural("ora", "ore"), Plural("giorno", "giorni"))} fa",
            "ru" => $"{n} {RuUnits[i][ru]} назад",
            "ja" => $"{n}{Pick(i, "分", "時間", "日")}前",
            "ko" => $"{n}{Pick(i, "분", "시간", "일")} 전",
            "hi" => $"{n} {Pick(i, "मिनट", "घंटे", "दिन")} पहले",
            "bn" => $"{n} {Pick(i, "মিনিট", "ঘণ্টা", "দিন")} আগে",
            "id" => $"{n} {Pick(i, "menit", "jam", "hari")} yang lalu",
            _ =>
                $"{n} {Pick(i, "minute", "hour", "day")}{(n == 1 ? "" : "s")} ago",
        };
    }

    private static string Now(string locale)
    {
        return locale switch {
            "zh-CN" => "现在",
            "zh-TW" => "現在",
            "es" => "ahora",
            "fr" => "maintenant",
            "de" => "jetzt",
            "pt" => "agora",
            "it" => "ora",
            "ru" => "сейчас",
            "ja" => "たった今",
            "ko" => "지금",
            "hi" => "अभी",
            "bn" => "এখন",
            "id" => "sekarang",
            _ => "now",
        };
    }

    /// <summary>"now", "5 minutes ago", "3 days ago" in the language, or the date from a week on: for "last active" (<c>formatRelative</c>).</summary>
    public static string Relative(long ts, DateTimeOffset now, string locale)
    {
        var diff = now.ToUnixTimeMilliseconds() - ts;
        if (diff < 60_000)
            return Now(locale);
        if (diff < 3_600_000)
            return Ago(locale, (int)(diff / 60_000), Unit.Minute);
        if (diff < 86_400_000)
            return Ago(locale, (int)(diff / 3_600_000), Unit.Hour);
        // A day ago is "yesterday", as Intl.RelativeTimeFormat says it with numeric "auto".
        if (diff < 2 * 86_400_000L)
            return I18n.Strings.T(locale, "yesterday").ToLower(Culture(locale));
        if (diff < 7 * 86_400_000L)
            return Ago(locale, (int)(diff / 86_400_000), Unit.Day);
        return DateTimeOffset.FromUnixTimeMilliseconds(ts).ToLocalTime()
            .ToString("MMM d, yyyy", Culture(locale));
    }

    /// <summary>A length of time as <c>m:ss</c>, or <c>h:mm:ss</c> from an hour.</summary>
    public static string Duration(TimeSpan t)
    {
        var total = (long)Math.Round(t.TotalSeconds);
        var h = total / 3600;
        var m = total % 3600 / 60;
        var sec = total % 60;
        return h > 0 ? $"{h}:{m:00}:{sec:00}" : $"{m}:{sec:00}";
    }

    private static readonly string[] ByteUnits = ["B", "KB", "MB", "GB"];

    public static string Bytes(long n)
    {
        if (n <= 0)
            return "";
        var units = ByteUnits;
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
