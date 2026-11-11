namespace OhMatrix.Core.Ui;

/// <summary>How big a picture is drawn in a bubble (<c>mediaSize.ts</c>).</summary>
public static class MediaSize {
    /// <summary>The longest edge a picture is shown at inside a bubble.</summary>
    public const int MaxImage = 300;

    /// <summary>Scales to fit <see cref="MaxImage"/> on the long edge, keeping the shape; an unknown size is a square; never smaller than 130 by 90.</summary>
    public static (int Width, int Height) Fit(int? w, int? h)
    {
        if (w == null || w == 0 || h == null || h == 0)
            return (MaxImage, MaxImage);
        var k = Math.Min(1.0, (double)MaxImage / Math.Max(w.Value, h.Value));
        return (
            Math.Max(130, (int)Math.Round(w.Value * k)),
            Math.Max(90, (int)Math.Round(h.Value * k))
        );
    }
}
