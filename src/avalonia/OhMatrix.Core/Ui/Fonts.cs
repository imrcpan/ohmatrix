using Avalonia.Media;

namespace OhMatrix.Core.Ui;

/// <summary>The system UI fonts: SF on Apple, Segoe UI on Windows, the platform default elsewhere (the stack of theme.tsx).</summary>
public static class Fonts {
    public static readonly FontFamily System = new(
        "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI Variable Text, Segoe UI, system-ui, Helvetica Neue, sans-serif"
    );
}
