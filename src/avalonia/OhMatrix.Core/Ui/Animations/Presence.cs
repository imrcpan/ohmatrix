using Avalonia;
using Avalonia.Animation.Easings;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// How something comes onto the screen and goes off it: it fades in while it grows a little from where it opens (or comes down from above), and
/// fades out the same way, faster. All of it is one number, how far in the thing is, from 0 (gone) to 1 (in place), that moves from where it is
/// to where it is sent; so a thing that is sent away while it is still coming turns round from where it is, with no jump. The only things set are
/// the opacity of <c>faded</c> and a transform on <c>moved</c>, and the transform is taken off again when the thing is in place.
/// </summary>
public sealed class Presence {
    private readonly Control faded;
    private readonly Control? moved;
    private readonly ScaleTransform scale = new(1, 1);
    private readonly TranslateTransform shift = new();
    private readonly TransformGroup transform;

    // How far in the thing is now, as it is drawn.
    private double progress = 1;

    // A motion is running, and which one: a motion that was replaced stops
    // at its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;

    /// <summary>
    /// Makes the presence of <paramref name="faded"/>, the control that fades; <paramref name="moved"/> is the one that grows or comes down, when it
    /// is not the same (the card in a dim backdrop that fades as a whole). Leave it out for a thing that only fades.
    /// </summary>
    public Presence(Control faded, Control? moved = null)
    {
        this.faded = faded;
        this.moved = moved;
        transform = new TransformGroup {
            Children = [scale, shift]
        };
    }

    /// <summary>How big it is when it starts to come, as a part of its size: 1 does not grow.</summary>
    public double FromScale { get; init; } = 0.96;

    /// <summary>How far above its place it starts to come, in device-independent pixels; 0 comes from its place.</summary>
    public double FromShift { get; init; }

    /// <summary>The time it takes to come (see <see cref="Durations"/>); less when it is part of the way in already.</summary>
    public int EnterTime { get; init; } = Durations.Slow;

    /// <summary>The time it takes to go.</summary>
    public int LeaveTime { get; init; } = Durations.Normal;

    /// <summary>The point of <c>moved</c> that stays where it is while it grows: where the thing opens from.</summary>
    public RelativePoint Origin { get; set; } = RelativePoint.Center;

    /// <summary>It is being sent away or is gone: from <see cref="Leave"/> until it is brought back by <see cref="Enter"/> or <see cref="Cancel"/>.</summary>
    public bool Leaving { get; private set; }

    /// <summary>
    /// Brings it in. Call it just after it is put in the tree, before it is drawn for the first time. With motion off it is there at once; if it
    /// was on its way out it turns round from where it is, and otherwise it starts from nothing.
    /// </summary>
    public void Enter()
    {
        Leaving = false;
        if (!running)
            progress = 0;
        Run(1, EnterTime, Curves.Enter, null);
    }

    /// <summary>
    /// Sends it away, and calls <paramref name="done"/> when it is gone, to take it out of the tree: at once with motion off. Sending it away
    /// again does nothing; bringing it back first means that <paramref name="done"/> is not called.
    /// </summary>
    public void Leave(Action done)
    {
        if (Leaving)
            return;
        Leaving = true;
        Run(0, LeaveTime, Curves.Exit, done);
    }

    /// <summary>Stops what is running and puts it in place, as it is when nothing has been done to it.</summary>
    public void Cancel()
    {
        session++;
        running = false;
        Leaving = false;
        progress = 1;
        Arrive(1);
    }

    private void Run(double to, int milliseconds, Easing curve, Action? done)
    {
        var id = ++session;
        var from = progress;
        // A motion that is part of the way is part of the time: the speed
        // of what turns round stays about what it was.
        var time = Motion.Time(
            (int)Math.Round(milliseconds * Math.Abs(to - from)));
        if (time == TimeSpan.Zero) {
            running = false;
            Arrive(to);
            done?.Invoke();
            return;
        }

        running = true;
        if (moved != null) {
            moved.RenderTransformOrigin = Origin;
            moved.RenderTransform = transform;
        }

        Apply(from);
        TimeSpan? start = null;

        void Frame(TimeSpan now)
        {
            if (id != session)
                return;
            // The time of the first frame is the start: the time that went
            // before it was not spent on the screen, and counting it would
            // skip the first of what is seen.
            start ??= now;
            var u = Math.Min(1,
                (now - start.Value).TotalMilliseconds / time.TotalMilliseconds);
            progress = from + (to - from) * curve.Ease(u);
            Apply(progress);
            if (u < 1 && Motion.Frames(faded, Frame))
                return;
            running = false;
            Arrive(to);
            done?.Invoke();
        }

        if (!Motion.Frames(faded, Frame)) {
            running = false;
            Arrive(to);
            done?.Invoke();
        }
    }

    // Draws it at this far in.
    private void Apply(double p)
    {
        faded.Opacity = p;
        if (moved == null)
            return;
        var s = FromScale + (1 - FromScale) * p;
        scale.ScaleX = s;
        scale.ScaleY = s;
        shift.Y = FromShift * (1 - p);
    }

    // Draws it where it ends: in place, with no transform on it, or gone.
    private void Arrive(double to)
    {
        progress = to;
        Apply(to);
        if (to >= 1 && moved != null)
            moved.RenderTransform = null;
    }
}
