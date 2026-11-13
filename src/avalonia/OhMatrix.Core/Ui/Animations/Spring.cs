namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// How a value settles on where it is sent, as a mass on a spring does. It starts from rest, is quickest in the middle and lands softly, with a
/// long tail that the eye takes for smoothness. A curve of a fixed time has no such start: it begins at its quickest, and what goes with it ends
/// at its quickest, which is what makes a motion look like a switch. A spring that is sent somewhere else on its way goes on from the speed it
/// has, so nothing in a turn round is abrupt either, and it has no time: what is asked of it at a moment is what it is at that moment, however
/// many frames there are.
/// </summary>
/// <param name="Response">The time of one swing, in seconds; the smaller it is, the quicker the spring.</param>
/// <param name="Damping">1 settles with no overshoot (more than 1 is taken for 1). Less goes a little past and comes back.</param>
public readonly record struct Spring(double Response, double Damping) {
    /// <summary>What comes into place (a card, a menu): half of the way in 85 ms, 90% in 170 ms, and 0.6% past its place.</summary>
    public static Spring Settle { get; } = new(0.34, 0.85);

    /// <summary>What should be seen to land (the notice at the top): 4.6% past its place before it settles.</summary>
    public static Spring Bounce { get; } = new(0.44, 0.7);

    /// <summary>What pops, small and playful (a reaction): it goes 12.6% past its place, which is a tenth past its size.</summary>
    public static Spring Pop { get; } = new(0.3, 0.55);

    /// <summary>What goes: 90% of the way in 110 ms, and no bounce.</summary>
    public static Spring Away { get; } = new(0.18, 1);

    /// <summary>The opacity of what comes: 97% in 135 ms, so it is whole before it is half way in place, and what moves is not a ghost.</summary>
    public static Spring Fade { get; } = new(0.16, 1);

    /// <summary>The opacity of what goes: 90% in 75 ms, and gone in 145.</summary>
    public static Spring Vanish { get; } = new(0.12, 1);

    /// <summary>The dimming of the window behind a dialog or a viewer, which comes a little slower than what is over it.</summary>
    public static Spring Dim { get; } = new(0.22, 1);
}

/// <summary>
/// A number that follows a <see cref="Spring"/> to where it is sent. It is worked out in closed form from the state it was sent from, so a late
/// frame, or a frame that comes sooner than the one before, gives what it is at that time and nothing is lost or added.
/// </summary>
internal sealed class SpringValue {
    // At rest when it is closer than this (0.08% of the way) and slower than
    // this (2% of the way in a second): nothing of that can be seen.
    private const double Near = 0.0008;
    private const double Slow = 0.02;

    private Spring spring;
    private double target;
    private double from;
    private double fromSpeed;
    private double start;

    /// <summary>A number at rest at <paramref name="value"/>.</summary>
    public SpringValue(double value)
    {
        Value = value;
        target = value;
    }

    public double Value { get; private set; }

    /// <summary>How fast it goes now, in its own units a second.</summary>
    public double Speed { get; private set; }

    /// <summary>It has been sent somewhere, and is on its way or waiting to start.</summary>
    public bool Moving { get; private set; }

    /// <summary>Puts it at rest at <paramref name="value"/>.</summary>
    public void Rest(double value)
    {
        Value = target = value;
        Speed = 0;
        Moving = false;
    }

    /// <summary>
    /// Sends it to <paramref name="to"/> from where it is and as fast as it goes, <paramref name="wait"/> seconds after <paramref name="now"/>.
    /// Before then it holds still, and then it starts from rest.
    /// </summary>
    public void To(double to, Spring by, double now, double wait = 0)
    {
        target = to;
        spring = by;
        from = Value;
        if (wait > 0)
            Speed = 0;
        fromSpeed = Speed;
        start = now + wait;
        Moving = true;
    }

    /// <summary>Works out where it is at <paramref name="now"/>, a time in seconds on the clock that <see cref="To"/> was given.</summary>
    public void Step(double now)
    {
        if (!Moving || now < start)
            return;
        var t = now - start;
        var d0 = from - target;
        var w = 2 * Math.PI / spring.Response;
        double d;
        double v;
        if (spring.Damping >= 0.999) {
            var c = fromSpeed + w * d0;
            var e = Math.Exp(-w * t);
            d = (d0 + c * t) * e;
            v = (c - w * (d0 + c * t)) * e;
        } else {
            var s = spring.Damping * w;
            var wd = w * Math.Sqrt(1 - spring.Damping * spring.Damping);
            var b = (fromSpeed + s * d0) / wd;
            var e = Math.Exp(-s * t);
            var cos = Math.Cos(wd * t);
            var sin = Math.Sin(wd * t);
            d = e * (d0 * cos + b * sin);
            v = e * ((b * wd - s * d0) * cos - (d0 * wd + s * b) * sin);
        }

        if (Math.Abs(d) < Near && Math.Abs(v) < Slow) {
            Rest(target);
            return;
        }

        Value = target + d;
        Speed = v;
    }
}
