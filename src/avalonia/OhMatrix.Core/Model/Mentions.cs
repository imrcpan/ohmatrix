namespace OhMatrix.Core.Model;

/// <summary>Mentions in the message box (<c>useMentionSuggest</c> of the TypeScript app): <c>@</c> offers the people of the room, and the ones picked are sent as <c>m.mentions</c>, which is what notifies them.</summary>
public sealed class Mentions {
    private readonly HashSet<string> picked = [];

    /// <summary>The <c>@token</c> just before the caret, when the caret is inside one: where it starts and what has been typed after the <c>@</c>.</summary>
    public static (int Start, string Query)? TokenAt(string text, int caret)
    {
        caret = Math.Clamp(caret, 0, text.Length);
        var before = text[..caret];
        var at = before.LastIndexOf('@');
        if (at < 0)
            return null;
        // "@" starts a mention at the beginning of the text or after anything that is not an ASCII letter or digit; "a@b" is an address.
        if (at > 0 && char.IsAsciiLetterOrDigit(before[at - 1]))
            return null;
        var query = before[(at + 1)..];
        return query.Any(char.IsWhiteSpace) ? null : (at, query);
    }

    /// <summary>Up to six people whose name or id has the query in it, those whose name starts with it first.</summary>
    public static IReadOnlyList<RoomMemberInfo> Suggest(
        IReadOnlyList<RoomMemberInfo> members,
        string query)
    {
        var q = query.ToLowerInvariant();
        return [
            .. members
                .Where(m =>
                    q.Length == 0 || m.Name.Contains(q,
                                      StringComparison.OrdinalIgnoreCase)
                                  || m.UserId.Contains(q,
                                      StringComparison.OrdinalIgnoreCase))
                .OrderBy(m =>
                    m.Name.StartsWith(q, StringComparison.OrdinalIgnoreCase)
                        ? 0
                        : 1)
                .ThenBy(m => m.Name, StringComparer.CurrentCultureIgnoreCase)
                .Take(6)
        ];
    }

    /// <summary>Puts the person's name in place of the <c>@token</c> and remembers them for the send; returns the new text and the caret.</summary>
    public (string Text, int Caret) Apply(RoomMemberInfo who, string text,
        int caret)
    {
        var token = TokenAt(text, caret);
        if (token == null)
            return (text, caret);
        picked.Add(who.UserId);
        var head = $"{text[..token.Value.Start]}@{who.Name} ";
        return (head + text[caret..], head.Length);
    }

    /// <summary>The ids whose <c>@name</c> is still in the text, plus any full id typed by hand.</summary>
    public IReadOnlyList<string> Resolve(string text,
        IReadOnlyList<RoomMemberInfo> members)
    {
        var found = new HashSet<string>();
        foreach (var m in members) {
            if (picked.Contains(m.UserId) &&
                text.Contains("@" + m.Name, StringComparison.Ordinal))
                found.Add(m.UserId);
            if (text.Contains(m.UserId, StringComparison.Ordinal))
                found.Add(m.UserId);
        }

        return [.. found];
    }

    public void Reset() => picked.Clear();
}
