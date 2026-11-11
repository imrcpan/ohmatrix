using Avalonia.Media;
using Avalonia.Media.TextFormatting;
using Avalonia.Controls;

namespace OhMatrix.Core.Ui;

/// <summary>The fonts of the interface: the system UI fonts (SF on Apple, Segoe UI on Windows, the platform default elsewhere; the stack of theme.tsx) unless the person chose an installed one.</summary>
public static class Fonts {
    private const string Stack =
        "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI Variable Text, Segoe UI, system-ui, Helvetica Neue, sans-serif";

    /// <summary>The font the interface is drawn with.</summary>
    public static FontFamily System { get; private set; } = new(Stack);

    /// <summary>Uses the installed font of this name for the interface (the system's stack stands behind it for characters it lacks); null goes back to the system's own.</summary>
    public static void Use(string? name)
    {
        System = new FontFamily(string.IsNullOrWhiteSpace(name)
            ? Stack
            : name + ", " + Stack);
    }

    /// <summary>
    /// Puts the middle of the letters of a one-line text at the middle of its box. A font draws its line with room above and below that is not the same on both sides (differently from one font to the next), so a text centred by its box can sit high or low beside an icon. The text must have its string, font and size.
    /// </summary>
    public static void Center(TextBlock text)
    {
        if (string.IsNullOrEmpty(text.Text))
            return;
        var layout = new TextLayout(text.Text,
            new Typeface(text.FontFamily, text.FontStyle, text.FontWeight),
            text.FontSize, null);
        // The middle of capitals and of ideographs is about 0.36 em above the baseline.
        var shift = layout.Height / 2 -
                    (layout.Baseline - 0.36 * text.FontSize);
        text.RenderTransform = new TranslateTransform(0, shift);
    }

    /// <summary>The names of the fonts installed, sorted.</summary>
    public static IReadOnlyList<string> Installed()
    {
        return [
            .. FontManager.Current.SystemFonts.Select(f => f.Name).Distinct()
                .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase)
        ];
    }
}
