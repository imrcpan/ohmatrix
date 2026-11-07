using Avalonia.Media;

namespace OhMatrix.Core.Theming;

/// <summary>Colour helpers that behave like the ones of the React Native theme code.</summary>
public static class ThemeColor {
    /// <summary>Parses <c>#rgb</c> or <c>#rrggbb</c>.</summary>
    public static Color Hex(string hex)
    {
        var h = hex.TrimStart('#');
        if (h.Length == 3)
            h = string.Concat(h[0], h[0], h[1], h[1], h[2], h[2]);
        return Color.FromRgb(Convert.ToByte(h[..2], 16),
            Convert.ToByte(h[2..4], 16),
            Convert.ToByte(h[4..6], 16));
    }

    /// <summary>A colour from 0-255 channels and an alpha of 0-1.</summary>
    public static Color Rgba(byte r, byte g, byte b, double alpha)
    {
        return Color.FromArgb(Clamp(alpha * 255), r, g, b);
    }

    /// <summary>The colour of <paramref name="hex"/> with the given alpha (0-1).</summary>
    public static Color WithAlpha(string hex, double alpha)
    {
        var c = Hex(hex);
        return Rgba(c.R, c.G, c.B, alpha);
    }

    /// <summary>Linear mix of two colours; <c>t</c> = 0 gives a, 1 gives b. The alpha is dropped.</summary>
    public static Color Mix(Color a, Color b, double t)
    {
        return Color.FromRgb(Lerp(a.R, b.R, t), Lerp(a.G, b.G, t),
            Lerp(a.B, b.B, t));
    }

    public static Color Mix(string a, string b, double t)
    {
        return Mix(Hex(a), Hex(b), t);
    }

    private static byte Lerp(byte a, byte b, double t)
    {
        return Clamp(a + (b - a) * t);
    }

    // Rounds half up, as Math.round does in the React Native code (not to even).
    private static byte Clamp(double n)
    {
        return (byte)Math.Max(0, Math.Min(255, Math.Floor(n + 0.5)));
    }
}
