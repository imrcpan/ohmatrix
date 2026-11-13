namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// A cubic Bézier timing curve, as CSS writes <c>cubic-bezier(x1, y1, x2, y2)</c>: the time goes from 0 to 1 along x, and the progress is read
/// along y, which may go past 0 and 1 (an overshoot). The curve is found the way a browser finds it: the parameter whose x is the time, then its y.
/// </summary>
public sealed class Bezier {
    private readonly double x1;
    private readonly double y1;
    private readonly double x2;
    private readonly double y2;

    public Bezier(double x1, double y1, double x2, double y2)
    {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    /// <summary>The progress at <paramref name="time"/>, from 0 at the start to 1 at the end.</summary>
    public double At(double time)
    {
        if (time <= 0)
            return 0;
        if (time >= 1)
            return 1;
        // The time rises with the parameter, so it is bisected to the one that
        // gives this time.
        var low = 0.0;
        var high = 1.0;
        for (var i = 0; i < 50; i++) {
            var mid = (low + high) / 2;
            if (X(mid) < time)
                low = mid;
            else
                high = mid;
        }

        return Y((low + high) / 2);
    }

    private double X(double s) =>
        3 * (1 - s) * (1 - s) * s * x1 + 3 * (1 - s) * s * s * x2 + s * s * s;

    private double Y(double s) =>
        3 * (1 - s) * (1 - s) * s * y1 + 3 * (1 - s) * s * s * y2 + s * s * s;
}

/// <summary>The timing curves the app's motion uses, named as CSS names them.</summary>
public static class Curves {
    /// <summary>CSS <c>ease</c>: starts a little quicker than it is in the middle, and settles.</summary>
    public static Bezier Ease { get; } = new(0.25, 0.1, 0.25, 1);

    /// <summary>CSS <c>ease-in</c>: starts slowly and speeds up, for what goes.</summary>
    public static Bezier EaseIn { get; } = new(0.42, 0, 1, 1);

    /// <summary>CSS <c>ease-out</c>: starts quickly and settles, for what comes.</summary>
    public static Bezier EaseOut { get; } = new(0, 0, 0.58, 1);

    /// <summary>
    /// <c>cubic-bezier(.34, 1.56, .64, 1)</c>: it goes past its place by about a tenth (its progress peaks at 1.098) and comes back to it.
    /// </summary>
    public static Bezier Overshoot { get; } = new(0.34, 1.56, 0.64, 1);

    /// <summary>
    /// <c>cubic-bezier(.3, 1.25, .5, 1)</c>, the <c>--ease</c> of the pop-up window: a light overshoot, and a quick settle.
    /// </summary>
    public static Bezier Drop { get; } = new(0.3, 1.25, 0.5, 1);

    /// <summary>CSS <c>cubic-bezier(.4, 0, .2, 1)</c>: the closing of the dialog, which goes steadily and stops gently.</summary>
    public static Bezier EaseClose { get; } = new(0.4, 0, 0.2, 1);

    // The overshoot of the dialog of the reference page, <c>--arc</c>: a
    // <c>linear()</c> through these points, evenly spaced in time.
    private static readonly double[] ArcPoints = [
        0, .503, .863, 1.039, 1.075, 1.074, 1.072, 1.068, 1.064, 1.058,
        1.052, 1.045, 1.038, 1.031, 1.024, 1.018, 1.012, 1.007, 1.003, 1.001, 1,
    ];

    /// <summary>
    /// The progress of <c>--arc</c> at <paramref name="time"/>: it reaches its peak (1.075) at a fifth of the time and settles on 1 at the end.
    /// </summary>
    public static double Arc(double time)
    {
        if (time <= 0)
            return 0;
        if (time >= 1)
            return 1;
        var at = time * (ArcPoints.Length - 1);
        var i = (int)Math.Floor(at);
        var t = at - i;
        return ArcPoints[i] + (ArcPoints[i + 1] - ArcPoints[i]) * t;
    }
}
