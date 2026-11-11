using System.Collections.Concurrent;
using System.Collections.Frozen;
using System.Text;

namespace OhMatrix.Core.I18n;

/// <summary>
/// The texts of the app, read from the TOML files of <c>src/i18n</c> (the same files the React Native app is built from). Keys are the same
/// strings. A text a language does not have yet is shown in English, and a key nobody has is shown as itself: never an exception.
/// </summary>
public static class Strings {
    public const string Fallback = "en";

    // Texts are read for every row and line that is drawn, so reading takes
    // no lock and does as little as it can: a loaded catalog is frozen (it
    // never changes, and a frozen dictionary finds a key faster), the one
    // used last and the English one are kept at hand, and the lock is only
    // for loading.
    private static readonly Lock Gate = new();

    private static readonly
        ConcurrentDictionary<string, FrozenDictionary<string, string>?>
        Catalogs = new();

    private sealed record Last(
        string Locale,
        FrozenDictionary<string, string>? Catalog);

    private static volatile Last? last;
    private static volatile FrozenDictionary<string, string>? english;

    private static volatile IReadOnlyList<Language>? languages;

    /// <summary>The languages of the list, in the order of the picker; English first.</summary>
    public static IReadOnlyList<Language> Languages {
        get {
            return languages ?? LoadedLanguages();
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
            var traditional = parts.Contains("hant") ||
                              parts.Any(p => p is "tw" or "hk" or "mo");
            return traditional ? "zh-TW" : "zh-CN";
        }

        // Indonesian was "in" in Java's old tags.
        if (language == "in")
            language = "id";
        return Languages.FirstOrDefault(l => l.Id == language)?.Id ?? Fallback;
    }

    /// <summary>
    /// Translates <paramref name="key"/>; <c>{name}</c> in the text is replaced by the value of the same name. The values are written as pairs,
    /// <c>("n", count)</c>, of a text or a whole number; they are kept on the stack and the number is written into the text without a string of its own.
    /// </summary>
    public static string T(string locale, string key,
        params ReadOnlySpan<Arg> values)
    {
        return Fill(TextOf(locale, key), values);
    }

    private static string TextOf(string locale, string key)
    {
        if (Catalog(locale)?.TryGetValue(key, out var text) == true)
            return text!;
        // A text a language does not have yet is shown in English.
        if (English().TryGetValue(key, out text))
            return text;
        return key;
    }

    private static FrozenDictionary<string, string> English()
    {
        return english ??= Catalog(Fallback)!;
    }

    /// <summary>Whether English has the key; the other languages are checked against these.</summary>
    public static IReadOnlyCollection<string> Keys()
    {
        return English().Keys.ToList();
    }

    [ThreadStatic] private static StringBuilder? builder;

    // A {name} at <at>: its name and where the text goes on after it.
    private static bool Placeholder(string text, int at,
        out ReadOnlySpan<char> name, out int next)
    {
        name = default;
        next = at;
        if (text[at] != '{')
            return false;
        var close = text.IndexOf('}', at + 1);
        if (close <= at + 1)
            return false;
        name = text.AsSpan(at + 1, close - at - 1);
        next = close + 1;
        return IsName(name);
    }

    private static string Fill(string text, ReadOnlySpan<Arg> values)
    {
        // Most texts have nothing to put in.
        if (values.IsEmpty || !text.Contains('{'))
            return text;
        var sb = builder ??= new StringBuilder(256);
        sb.Clear();
        var i = 0;
        while (i < text.Length) {
            if (!Placeholder(text, i, out var name, out var next)) {
                sb.Append(text[i++]);
                continue;
            }

            foreach (var v in values) {
                if (name.SequenceEqual(v.Name))
                    v.AppendTo(sb);
            }

            i = next;
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

    private static FrozenDictionary<string, string>? Catalog(string locale)
    {
        // The same language is asked for again and again.
        if (last is { } kept && (ReferenceEquals(kept.Locale, locale) ||
                                 kept.Locale == locale))
            return kept.Catalog;
        FrozenDictionary<string, string>? loaded;
        if (!Catalogs.TryGetValue(locale, out loaded)) {
            lock (Gate) {
                if (!Catalogs.TryGetValue(locale, out loaded)) {
                    // Only the languages of the list are read, so that an id from outside never names a resource.
                    loaded = LoadedLanguages().Any(l => l.Id == locale)
                        ? TomlLite.Parse(Read($"i18n/{locale}.toml")).Root
                            .ToFrozenDictionary()
                        : null;
                    Catalogs[locale] = loaded;
                }
            }
        }

        last = new Last(locale, loaded);
        return loaded;
    }

    private static IReadOnlyList<Language> LoadedLanguages()
    {
        lock (Gate) {
            return languages ??= LoadLanguages();
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
        using var stream =
            typeof(Strings).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException(
                $"the resource {name} is missing");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
