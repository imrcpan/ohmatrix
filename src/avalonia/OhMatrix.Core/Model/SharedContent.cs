using System.Text.RegularExpressions;

namespace OhMatrix.Core.Model;

/// <summary>What another app shares to this one (<c>SharedContent</c> of the TypeScript core): text, and paths of files on disk.</summary>
public sealed partial record SharedContent(
    string? Text,
    IReadOnlyList<string> Files
) {
    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>A line saying what is shared: the files, and the start of the text.</summary>
    public string Describe(OhMatrix.Core.I18n.Translate t)
    {
        var parts = new List<string>();
        if (Files.Count > 0)
            parts.Add(Files.Count == 1
                ? t("share.file")
                : t("share.files", ("count", Files.Count)));
        var text = Whitespace().Replace(Text ?? "", " ").Trim();
        if (text.Length > 0)
            parts.Add(text.Length > 60 ? text[..60] + "…" : text);
        return parts.Count == 0
            ? t("share.text")
            : string.Join(" · ", parts);
    }
}
