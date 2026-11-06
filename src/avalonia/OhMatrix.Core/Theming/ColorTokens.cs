using Avalonia.Media;

namespace OhMatrix.Core.Theming;

/// <summary>The colours the UI reads; the same tokens as <c>ColorTokens</c> of the React Native app.</summary>
public sealed record ColorTokens {
    /// <summary>Primary surface (lists, headers).</summary>
    public required Color Bg { get; init; }

    /// <summary>Grouped and inset surfaces, the search field.</summary>
    public required Color BgSecondary { get; init; }

    /// <summary>The chat wallpaper.</summary>
    public required Color ChatBg { get; init; }

    public required Color Separator { get; init; }
    public required Color Text { get; init; }
    public required Color TextSecondary { get; init; }
    public required Color TextTertiary { get; init; }
    public required Color Accent { get; init; }
    public required Color OnAccent { get; init; }
    public required Color Danger { get; init; }
    public required Color BubbleIn { get; init; }
    public required Color BubbleInText { get; init; }
    public required Color BubbleOut { get; init; }
    public required Color BubbleOutText { get; init; }
    public required Color BubbleOutMeta { get; init; }

    /// <summary>A desktop row under the pointer.</summary>
    public required Color Hover { get; init; }

    /// <summary>A desktop selected row.</summary>
    public required Color Selected { get; init; }

    public required Color OnSelected { get; init; }
    public required Color OnSelectedSecondary { get; init; }
    public required Color Badge { get; init; }
    public required Color BadgeMuted { get; init; }
    public required Color ServiceChip { get; init; }
    public required Color ServiceChipText { get; init; }
    public required Color Overlay { get; init; }

    /// <summary>Background of an @mention pill.</summary>
    public required Color MentionBg { get; init; }

    /// <summary>Background of a highlighted message that mentions me.</summary>
    public required Color MentionHighlight { get; init; }
}
