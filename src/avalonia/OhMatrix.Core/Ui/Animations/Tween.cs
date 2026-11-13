namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// One value that moves the way a CSS transition moves a property: from where it is, to the value it is sent to, over a time, after a delay,
/// along a curve. Sent somewhere else while it moves, it starts again from where it is with the new time and curve, so nothing jumps. The time
/// starts at the first frame after it was sent, as a style change does in a browser. What is sent to the value it already goes to does nothing.
/// </summary>
internal sealed class Tween {
    private double value;
    private double from;
    private double to;
    private double seconds;
    private double delay;
    private Bezier curve = Curves.Ease;
    private double? started;
    private bool moving;

    public Tween(double value)
    {
        this.value = value;
        to = value;
    }

    public double Value => value;

    /// <summary>The value it is going to, or is at.</summary>
    public double Target => to;

    /// <summary>It is on its way, or waiting for its first frame.</summary>
    public bool Moving => moving;

    /// <summary>Puts it at <paramref name="at"/> with nothing on its way.</summary>
    public void Rest(double at)
    {
        value = from = to = at;
        moving = false;
        started = null;
    }

    /// <summary>
    /// Sends it to <paramref name="target"/>, over <paramref name="time"/> seconds (0 is at once), after <paramref name="wait"/> seconds, along
    /// <paramref name="along"/>.
    /// </summary>
    public void Go(double target, double time, Bezier along, double wait = 0)
    {
        if (target == to)
            return;
        if (time <= 0) {
            Rest(target);
            return;
        }

        from = value;
        to = target;
        seconds = time;
        delay = wait;
        curve = along;
        started = null;
        moving = true;
    }

    /// <summary>Works out where it is at <paramref name="now"/>, in seconds on the clock of the frames.</summary>
    public void Step(double now)
    {
        if (!moving)
            return;
        started ??= now;
        var t = (now - started.Value - delay) / seconds;
        if (t <= 0) {
            value = from;
            return;
        }

        if (t >= 1) {
            Rest(to);
            return;
        }

        value = from + (to - from) * curve.At(t);
    }
}
