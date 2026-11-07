using System.Globalization;
using System.Text;

namespace OhMatrix.Core.I18n;

/// <summary>
/// A reader of the small part of TOML that the files of <c>src/i18n</c> use: <c>key = "value"</c> lines (the key bare or in quotes),
/// <c>[[name]]</c> array tables, and comments. Strings are basic (<c>"..."</c> with the TOML escapes) or literal (<c>'...'</c>).
/// Anything else is an error that names the line, so that a file written by hand cannot be read half way.
/// </summary>
public static class TomlLite {
    /// <summary>The key/value pairs before the first table, and the array tables in the order they come.</summary>
    public sealed record Document(
        Dictionary<string, string> Root,
        List<(string Name, Dictionary<string, string> Table)> ArrayTables
    );

    public static Document Parse(string text)
    {
        var root = new Dictionary<string, string>();
        var tables = new List<(string, Dictionary<string, string>)>();
        var current = root;
        var number = 0;
        foreach (var raw in text.Split('\n')) {
            number++;
            var line = raw.Trim();
            if (line.Length == 0 || line[0] == '#')
                continue;
            if (line[0] == '[') {
                if (!line.StartsWith("[[", StringComparison.Ordinal))
                    throw Error(number, "only [[array]] tables are supported");
                var end = line.IndexOf("]]", StringComparison.Ordinal);
                if (end < 0 || !IsComment(line, end + 2))
                    throw Error(number, "a table header must end with ]]");
                var name = line[2..end].Trim();
                if (name.Length == 0 || name.Contains('.') ||
                    name.Contains('"'))
                    throw Error(number, "unsupported table name");
                current = new Dictionary<string, string>();
                tables.Add((name, current));
                continue;
            }

            var pos = 0;
            var key = ReadKey(line, ref pos, number);
            SkipSpaces(line, ref pos);
            if (pos >= line.Length || line[pos] != '=')
                throw Error(number, "expected = after the key");
            pos++;
            SkipSpaces(line, ref pos);
            var value = ReadString(line, ref pos, number);
            if (!IsComment(line, pos))
                throw Error(number, "unexpected text after the value");
            if (!current.TryAdd(key, value))
                throw Error(number, $"the key \"{key}\" is defined twice");
        }

        return new Document(root, tables);
    }

    private static string ReadKey(string line, ref int pos, int number)
    {
        if (line[pos] == '"' || line[pos] == '\'')
            return ReadString(line, ref pos, number);
        var start = pos;
        while (pos < line.Length &&
               (char.IsAsciiLetterOrDigit(line[pos]) ||
                line[pos] is '_' or '-'))
            pos++;
        if (pos == start)
            throw Error(number, "expected a key");
        return line[start..pos];
    }

    private static string ReadString(string line, ref int pos, int number)
    {
        if (pos >= line.Length)
            throw Error(number, "expected a string");
        var quote = line[pos];
        if (quote != '"' && quote != '\'')
            throw Error(number, "expected a string in quotes");
        if (line.AsSpan(pos).StartsWith(new string(quote, 3)))
            throw Error(number, "multi-line strings are not supported");
        pos++;
        var sb = new StringBuilder();
        while (pos < line.Length) {
            var c = line[pos++];
            if (c == quote)
                return sb.ToString();
            if (c != '\\' || quote == '\'') {
                sb.Append(c);
                continue;
            }

            if (pos >= line.Length)
                break;
            var e = line[pos++];
            switch (e) {
                case 'b':
                    sb.Append('\b');
                    break;
                case 't':
                    sb.Append('\t');
                    break;
                case 'n':
                    sb.Append('\n');
                    break;
                case 'f':
                    sb.Append('\f');
                    break;
                case 'r':
                    sb.Append('\r');
                    break;
                case '"':
                    sb.Append('"');
                    break;
                case '\\':
                    sb.Append('\\');
                    break;
                case 'u':
                    sb.Append(ReadCodePoint(line, ref pos, 4, number));
                    break;
                case 'U':
                    sb.Append(ReadCodePoint(line, ref pos, 8, number));
                    break;
                default:
                    throw Error(number, $"unknown escape \\{e}");
            }
        }

        throw Error(number, "the string is not closed");
    }

    private static string ReadCodePoint(string line, ref int pos, int digits,
        int number)
    {
        if (pos + digits > line.Length
            || !int.TryParse(line.AsSpan(pos, digits),
                NumberStyles.AllowHexSpecifier,
                CultureInfo.InvariantCulture, out var code))
            throw Error(number, "a bad \\u escape");
        pos += digits;
        // A lone surrogate half (\uD83D) is how JSON writes half of a pair; it is kept as it is, a pair then forms by itself.
        if (code is >= 0xD800 and <= 0xDFFF)
            return ((char)code).ToString();
        if (code > 0x10FFFF)
            throw Error(number, "a bad \\u escape");
        return char.ConvertFromUtf32(code);
    }

    private static void SkipSpaces(string line, ref int pos)
    {
        while (pos < line.Length && (line[pos] == ' ' || line[pos] == '\t'))
            pos++;
    }

    private static bool IsComment(string line, int pos)
    {
        SkipSpaces(line, ref pos);
        return pos >= line.Length || line[pos] == '#';
    }

    private static FormatException Error(int number, string message)
    {
        return new FormatException($"TOML line {number}: {message}");
    }
}
