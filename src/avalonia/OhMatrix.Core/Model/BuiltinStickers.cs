namespace OhMatrix.Core.Model;

/// <summary>
/// The emoji set that stands first in the sticker panel, always: Open Emoji
/// Cute (github.com/imrcpan/open-emoji-cute), drawn at 128 px and embedded in
/// the app. It is not in my pack and not in the account; a sticker of it is
/// uploaded when it is sent. Its urls are <c>builtin:name</c>.
/// </summary>
public static class BuiltinStickers {
    /// <summary>The name of the set's group: a name, not a translated word, so it is the same in every language.</summary>
    public const string Name = "Open Emoji Cute";

    /// <summary>The scheme of the urls of the set.</summary>
    public const string Scheme = "builtin:";

    /// <summary>The emoji that is the cover of the set.</summary>
    public const string Cover = "devil";

    /// <summary>The emoji that is the cover of a group with none.</summary>
    public const string Fallback = "playful";

    /// <summary>The pixels of each side of a picture.</summary>
    public const int Pixels = 128;

    // In the order of the set's page.
    private static readonly string[] Names = [
        "smile", "laugh", "laugh-cry", "tongue", "playful", "delighted",
        "stifled-laugh", "angel", "devil", "blissful", "expressionless",
        "disdain", "stunned", "thinking", "huff", "sad", "wronged", "pitiful",
        "downcast", "exhausted", "angry", "furious", "cursing", "annoyed",
        "terrified", "vomit", "eye-roll", "puzzled", "awkward-laugh",
    ];

    /// <summary>The set as stickers, in order.</summary>
    public static IReadOnlyList<Sticker> All { get; } = [
        .. Names.Select(n => new Sticker(n, Scheme + n, "image/png", Pixels,
            Pixels))
    ];

    /// <summary>Whether a url is one of the set.</summary>
    public static bool Is(string? url)
    {
        return url != null &&
               url.StartsWith(Scheme, StringComparison.Ordinal);
    }

    /// <summary>The name in a url of the set.</summary>
    public static string NameOf(string url)
    {
        return url[Scheme.Length..];
    }

    /// <summary>The PNG of an emoji of the set; null for a name it does not have.</summary>
    public static byte[]? Png(string name)
    {
        using var stream = typeof(BuiltinStickers).Assembly
            .GetManifestResourceStream($"emoji-cute/{name}.png");
        if (stream == null)
            return null;
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        return memory.ToArray();
    }
}
