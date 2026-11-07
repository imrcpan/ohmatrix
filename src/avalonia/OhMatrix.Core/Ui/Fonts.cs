using Avalonia.Media;

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

    /// <summary>The names of the fonts installed, sorted.</summary>
    public static IReadOnlyList<string> Installed()
    {
        return [
            .. FontManager.Current.SystemFonts.Select(f => f.Name).Distinct()
                .OrderBy(n => n, StringComparer.CurrentCultureIgnoreCase)
        ];
    }
}
