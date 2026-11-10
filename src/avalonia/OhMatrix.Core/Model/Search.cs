namespace OhMatrix.Core.Model;

/// <summary>A message found by a search (<c>SearchResult</c> of the TypeScript core).</summary>
public sealed record SearchResult(
    string EventId,
    string RoomId,
    string RoomName,
    string SenderId,
    string SenderName,
    long Ts,
    string Text
);

/// <summary>One page of results, newest first; <paramref name="Next"/> is passed back for the following page, null when there is none.</summary>
public sealed record SearchPage(
    IReadOnlyList<SearchResult> Results,
    string? Next);

/// <summary>A short excerpt of a text around the first occurrence of a term, so a result shows the hit in context (<c>makeSnippet</c>).</summary>
public sealed record Snippet(string Before, string Match, string After) {
    public static Snippet Make(string text, string term, int radius = 36)
    {
        var flat = Collapse(text);
        var needle = Collapse(term);
        var at = needle.Length == 0
            ? -1
            : flat.IndexOf(needle, StringComparison.CurrentCultureIgnoreCase);
        if (at < 0)
            return new Snippet("", "", flat.Length > radius * 2
                ? flat[..(radius * 2)].TrimEnd() + "..."
                : flat);
        var from = Math.Max(0, at - radius);
        var to = Math.Min(flat.Length, at + needle.Length + radius);
        return new Snippet(
            (from > 0 ? "..." : "") + flat[from..at].TrimStart(),
            flat.Substring(at, needle.Length),
            flat[(at + needle.Length)..to].TrimEnd() +
            (to < flat.Length ? "..." : ""));
    }

    // Every run of white space becomes one space and the ends are trimmed.
    // Made by hand and not by a regular expression: the program is compiled
    // ahead of time, and this is done for each hit of a search.
    internal static string Collapse(string s)
    {
        var clean = true;
        for (var i = 0; i < s.Length && clean; i++) {
            clean = !char.IsWhiteSpace(s[i]) ||
                    s[i] == ' ' && i > 0 && i < s.Length - 1 &&
                    !char.IsWhiteSpace(s[i + 1]) &&
                    !char.IsWhiteSpace(s[i - 1]);
        }

        if (clean)
            return s;
        var text = new System.Text.StringBuilder(s.Length);
        var space = false;
        foreach (var ch in s) {
            if (char.IsWhiteSpace(ch)) {
                space = text.Length > 0;
                continue;
            }

            if (space)
                text.Append(' ');
            space = false;
            text.Append(ch);
        }

        return text.ToString();
    }
}
