namespace OhMatrix.Core.Theming;

/// <summary>A theme is plain data; the UI reads its tokens and nothing else.</summary>
public sealed record ThemeDefinition(
    string Id,
    IReadOnlyDictionary<string, string> Label,
    bool Dark,
    ColorTokens Colors
) {
    /// <summary>The name in <paramref name="locale"/>, else the English one, else the id.</summary>
    public string LabelFor(string locale)
    {
        if (Label.TryGetValue(locale, out var name))
            return name;
        return Label.TryGetValue("en", out var en) ? en : Id;
    }
}

/// <summary>The few colours a theme is derived from; <see cref="Themes.Define"/> fills in the rest.</summary>
public sealed record ThemeSeed {
    public required string Id { get; init; }
    public required IReadOnlyDictionary<string, string> Label { get; init; }
    public required bool Dark { get; init; }
    public required string Accent { get; init; }
    public string? Bg { get; init; }
    public string? BgSecondary { get; init; }
    public string? ChatBg { get; init; }
    public string? BubbleIn { get; init; }
    public string? BubbleOut { get; init; }
    public string? Text { get; init; }

    /// <summary>Changes any derived token, as the <c>overrides</c> of the React Native seed do.</summary>
    public Func<ColorTokens, ColorTokens>? Overrides { get; init; }
}
