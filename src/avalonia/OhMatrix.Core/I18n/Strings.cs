using System.Globalization;
using System.Reflection;

namespace OhMatrix.Core.I18n;

/// <summary>
/// The texts of the app, read from the TOML files of <c>src/i18n</c> (the same files the React Native app is built from). Keys are the same
/// strings. A text a language does not have yet is shown in English, and a key nobody has is shown as itself: never an exception.
/// </summary>
public static class Strings {
    public const string Fallback = "en";

    private static readonly Lock Gate = new();

    private static readonly Dictionary<string, IReadOnlyDictionary<string, string>>
        Catalogs = new();

    private static IReadOnlyList<Language>? languages;

    /// <summary>The languages of the list, in the order of the picker; English first.</summary>
    public static IReadOnlyList<Language> Languages {
        get {
            lock (Gate) {
                return languages ??= LoadLanguages();
            }
        }
    }

    /// <summary>Whether <paramref name="id"/> is one of the languages (a saved preference may name one this version lacks).</summary>
    public static bool IsLocale(string? id)
    {
        return id is not null && Languages.Any(l => l.Id == id);
    }

    /// <summary>Whether the language has texts of its own.</summary>
    public static bool HasCatalog(string locale)
    {
        return Catalog(locale) is not null;
    }

    /// <summary>
    /// The language for a system language tag (<c>fr-CA</c>, <c>zh-Hant-HK</c>, <c>pt_BR</c>): the one of the same language, else English.
    /// Chinese is split by script or region: Traditional for <c>zh-Hant</c>, <c>zh-TW</c>, <c>zh-HK</c> and <c>zh-MO</c>, Simplified otherwise.
    /// </summary>
    public static string DetectLocale(string? tag)
    {
        var parts = (tag ?? "").ToLowerInvariant().Replace('_', '-').Split('-');
        var language = parts[0];
        if (language == "zh") {
            var traditional = parts.Contains("hant") || parts.Any(p => p is "tw" or "hk" or "mo");
            return traditional ? "zh-TW" : "zh-CN";
        }

        // Indonesian was "in" in Java's old tags.
        if (language == "in")
            language = "id";
        return Languages.FirstOrDefault(l => l.Id == language)?.Id ?? Fallback;
    }

    /// <summary>Translates <paramref name="key"/>; <c>{name}</c> in the text is replaced by the value of the same name.</summary>
    public static string T(string locale, string key, params (string Name, object Value)[] values)
    {
        var text = Catalog(locale)?.GetValueOrDefault(key) ??
                   Catalog(Fallback)?.GetValueOrDefault(key) ?? key;
        return values.Length == 0 ? text : Fill(text, values);
    }

    /// <summary>Whether English has the key; the other languages are checked against these.</summary>
    public static IReadOnlyCollection<string> Keys()
    {
        return Catalog(Fallback)!.Keys.ToList();
    }

    private static string Fill(string text, (string Name, object Value)[] values)
    {
        var sb = new System.Text.StringBuilder(text.Length + 16);
        var i = 0;
        while (i < text.Length) {
            var open = text[i];
            if (open == '{') {
                var close = text.IndexOf('}', i + 1);
                if (close > i + 1 && IsName(text.AsSpan(i + 1, close - i - 1))) {
                    var name = text.Substring(i + 1, close - i - 1);
                    foreach (var (n, v) in values) {
                        if (n == name)
                            sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
                    }

                    i = close + 1;
                    continue;
                }
            }

            sb.Append(open);
            i++;
        }

        return sb.ToString();
    }

    // The \w+ of the React Native code: letters, digits and underscore.
    private static bool IsName(ReadOnlySpan<char> s)
    {
        foreach (var c in s) {
            if (!char.IsLetterOrDigit(c) && c != '_')
                return false;
        }

        return s.Length > 0;
    }

    private static IReadOnlyDictionary<string, string>? Catalog(string locale)
    {
        lock (Gate) {
            if (Catalogs.TryGetValue(locale, out var loaded))
                return loaded;
            // Only the languages of the list are read, so that an id from outside never names a resource.
            if (!(languages ??= LoadLanguages()).Any(l => l.Id == locale))
                return null;
            var catalog = TomlLite.Parse(Read($"i18n/{locale}.toml")).Root;
            Catalogs[locale] = catalog;
            return catalog;
        }
    }

    private static IReadOnlyList<Language> LoadLanguages()
    {
        var doc = TomlLite.Parse(Read("i18n/languages.toml"));
        return doc.ArrayTables
            .Where(t => t.Name == "language")
            .Select(t => new Language(t.Table["id"], t.Table["label"]))
            .ToList();
    }

    private static string Read(string name)
    {
        using var stream = typeof(Strings).Assembly.GetManifestResourceStream(name)
                           ?? throw new InvalidOperationException(
                               $"the resource {name} is missing");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
