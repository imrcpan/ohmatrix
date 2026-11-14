namespace OhMatrix.Core.Ui.Media;

/// <summary>How big a picture is drawn in a bubble (<c>mediaSize.ts</c>).</summary>
public static class MediaSize {
    /// <summary>The longest edge a picture is shown at inside a bubble.</summary>
    public const int MaxImage = 300;

    /// <summary>The longest edge a sticker is shown at inside a bubble: its picture may be larger, to stay sharp.</summary>
    public const int MaxSticker = 130;

    /// <summary>Scales to fit <paramref name="max"/> on the long edge, keeping the shape; an unknown size is a square; never smaller than 130 by 90.</summary>
    public static (int Width, int Height) Fit(int? w, int? h,
        int max = MaxImage)
    {
        if (w == null || w == 0 || h == null || h == 0)
            return (max, max);
        var k = Math.Min(1.0, (double)max / Math.Max(w.Value, h.Value));
        return (
            Math.Max(130, (int)Math.Round(w.Value * k)),
            Math.Max(90, (int)Math.Round(h.Value * k))
        );
    }
}
