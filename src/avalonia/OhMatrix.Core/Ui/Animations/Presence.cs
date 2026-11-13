using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>The springs of one direction of a <see cref="Presence"/>: the one that moves the thing, the one that fades it and the one that fades the backdrop.</summary>
public sealed record Feel(Spring Move, Spring Fade, Spring Dim) {
    public Feel(Spring move, Spring fade) : this(move, fade, fade)
    {
    }
}

/// <summary>
/// How something comes onto the screen and goes off it. Three numbers, each from 0 (gone) to 1 (in place), follow springs of their own: how far
/// the thing has moved (it grows from <see cref="FromScale"/> and comes from <see cref="FromX"/>, <see cref="FromY"/>), how visible it is, and
/// how dim the window behind it is. They are separate so that what comes is whole before it is in place (a thing that moves while it is a ghost
/// looks like a fade), and so that the backdrop leads what is over it. A thing that is sent away while it is coming turns round from where it is
/// and from the speed it has, with no jump.
/// <para>
/// While it moves the thing is drawn once into a bitmap and the bitmap is what moves (<see cref="Cached"/>). Text and shadows that are scaled
/// by the drawing, frame after frame, are made again at each size, which costs time that a frame does not have and shimmers; a bitmap that is
/// scaled and faded costs nothing, and the screen draws it on its own, whatever the rest of the app is doing. The bitmap is dropped when the
/// thing is in place, and the thing is drawn as it always is. Only opacity and a render transform are set, and the transform is taken off then
/// too, so a motion never lays out the controls around it.
/// </para>
/// </summary>
public sealed class Presence {
    // The most time that a frame may add to a motion. A frame that comes late (the window was busy, or a control was made and compiled for the
    // first time) moves the motion on by this much and not by all that was lost, so it goes on from where it was seen and does not skip.
    private const double LongestStep = 1.0 / 30;

    // Gone when it is this faint: the rest of its motion is not seen.
    private const double Faint = 0.004;

    private readonly Control faded;
    private readonly Control? moved;
    private readonly ScaleTransform scale = new(1, 1);
    private readonly TranslateTransform shift = new();

    private readonly TransformGroup transform;

    // The bitmap is not put on whole pixels, which would make a slow motion
    // go by steps, and it has its text drawn as the screen draws it (the
    // things that are cached have an opaque surface under their text), so
    // that nothing of the text changes when the bitmap is dropped: a render
    // of it in place is the same, to within 2 of 255, as one with no bitmap.
    private readonly BitmapCache cache = new() {
        SnapsToDevicePixels = false,
        EnableClearType = true,
    };

    private readonly SpringValue fade = new(1);
    private readonly SpringValue move = new(1);
    private readonly SpringValue dim = new(1);

    // A motion is running, and which one: a motion that was replaced stops
    // at its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;
    private TimeSpan? last;
    private double clock;
    private Action? done;

    /// <summary>
    /// Makes the presence of <paramref name="faded"/>, the control that fades; <paramref name="moved"/> is the one that grows and comes, when it
    /// is not the same (the card of a dialog, whose backdrop is dimmed by <see cref="Backdrop"/>). Leave it out for a thing that only fades.
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
    public double FromScale { get; set; } = 1;

    /// <summary>How far to the right of its place it starts to come, in device-independent pixels.</summary>
    public double FromX { get; set; }

    /// <summary>How far below its place it starts to come: a thing that comes down from above has a negative number.</summary>
    public double FromY { get; set; }

    /// <summary>The point of <c>moved</c> that stays where it is while it grows: where the thing opens from.</summary>
    public RelativePoint Origin { get; set; } = RelativePoint.Center;

    /// <summary>The springs of what comes, and of what goes. What goes is quicker.</summary>
    public Feel EnterFeel { get; init; } =
        new(Spring.Settle, Spring.Fade, Spring.Dim);

    public Feel LeaveFeel { get; init; } =
        new(Spring.Away, Spring.Vanish, Spring.Vanish);

    /// <summary>How much of the way back to where it came from the thing goes while it fades out: 1 all of it, 0.3 a little.</summary>
    public double LeaveReach { get; init; } = 1;

    /// <summary>How long the thing waits to come, after the backdrop has started: the card of a dialog follows its dimming.</summary>
    public TimeSpan Delay { get; init; }

    /// <summary>
    /// Whether the thing is drawn into a bitmap while it moves. It is for what has text and shadows; a picture is a bitmap already.
    /// </summary>
    public bool Cached { get; init; } = true;

    /// <summary>
    /// The thing is never faded, it only moves: a picture that flies out of its thumbnail, which is taken out of the chat as it goes, must be
    /// whole from the first frame, or the picture would blink. It is gone when it has landed.
    /// </summary>
    public bool Solid { get; set; }

    /// <summary>
    /// The brush that dims the window behind the thing: its opacity follows how dim the window is. Set it when the brush is made, before
    /// <see cref="Enter"/>.
    /// </summary>
    public Brush? Backdrop {
        get;
        set {
            field = value;
            if (value != null)
                value.Opacity = Math.Clamp(dim.Value, 0, 1);
        }
    }

    /// <summary>It is being sent away or is gone: from <see cref="Leave"/> until it is brought back by <see cref="Enter"/> or <see cref="Cancel"/>.</summary>
    public bool Leaving { get; private set; }

    /// <summary>
    /// Brings it in. Call it just after it is put in the tree, before it is drawn for the first time. With motion off it is there at once; if it
    /// was on its way out it turns round from where it is, and otherwise it starts from nothing. A <paramref name="wait"/> puts it after the
    /// ones that came before it (the reactions of a message come one after the other).
    /// </summary>
    public void Enter(TimeSpan? wait = null)
    {
        Leaving = false;
        done = null;
        if (!running) {
            fade.Rest(0);
            move.Rest(0);
            dim.Rest(0);
        }

        Go(true, EnterFeel, (wait ?? Delay).TotalSeconds);
    }

    /// <summary>
    /// Sends it away, and calls <paramref name="onGone"/> when it is gone, to take it out of the tree: at once with motion off. Sending it away
    /// again does nothing; bringing it back first means that <paramref name="onGone"/> is not called.
    /// </summary>
    public void Leave(Action onGone)
    {
        if (Leaving)
            return;
        Leaving = true;
        done = onGone;
        Go(false, LeaveFeel, 0);
    }

    /// <summary>Stops what is running and puts it in place, as it is when nothing has been done to it.</summary>
    public void Cancel()
    {
        session++;
        running = false;
        Leaving = false;
        done = null;
        Arrive(1);
    }

    private void Go(bool entering, Feel feel, double wait)
    {
        if (!Motion.Enabled) {
            Finish(entering);
            return;
        }

        if (!running) {
            clock = 0;
            last = null;
        }

        var to = entering ? 1 : 0;
        var reach = entering ? 1 : 1 - LeaveReach;
        if (Solid)
            fade.Rest(1);
        else
            fade.To(to, feel.Fade, clock, wait);
        // What nothing draws is not moved: a thing that stays where it is,
        // and a window that is not dimmed, are where they are sent at once,
        // and the motion does not run for them.
        if (Backdrop == null)
            dim.Rest(to);
        else
            dim.To(to, feel.Dim, clock);
        if (moved == null)
            move.Rest(reach);
        else
            move.To(reach, feel.Move, clock, wait);
        Hold();
        Apply();
        if (running)
            return;
        running = true;
        var id = ++session;

        void Tick(TimeSpan now)
        {
            if (id == session)
                Frame(now, Tick);
        }

        // In no window there is no frame to wait for.
        if (Motion.Frames(faded, Tick))
            return;
        running = false;
        Finish(entering);
    }

    private void Frame(TimeSpan now, Action<TimeSpan> next)
    {
        if (last is { } before)
            clock += Math.Min((now - before).TotalSeconds, LongestStep) /
                     Math.Max(Motion.Slowdown, 0.01);
        last = now;
        fade.Step(clock);
        move.Step(clock);
        dim.Step(clock);
        Apply();
        // Going is over when it is not seen any more: faded, or, when it is
        // not faded, back where it came from.
        var over = Leaving
            ? dim.Value < Faint && (Solid
                ? Math.Abs(move.Value - (1 - LeaveReach)) < Faint
                : fade.Value < Faint)
            : !fade.Moving && !move.Moving && !dim.Moving;
        if (!over && Motion.Frames(faded, next))
            return;
        running = false;
        Finish(!Leaving);
    }

    // It is where it was sent: in place, or gone and the one who took it away is told.
    private void Finish(bool entered)
    {
        Arrive(entered ? 1 : 0);
        if (entered)
            return;
        var onGone = done;
        done = null;
        onGone?.Invoke();
    }

    // Draws it as it is now.
    private void Apply()
    {
        faded.Opacity = Math.Clamp(fade.Value, 0, 1);
        if (Backdrop != null)
            Backdrop.Opacity = Math.Clamp(dim.Value, 0, 1);
        if (moved == null)
            return;
        var s = FromScale + (1 - FromScale) * move.Value;
        scale.ScaleX = s;
        scale.ScaleY = s;
        shift.X = FromX * (1 - move.Value);
        shift.Y = FromY * (1 - move.Value);
    }

    // It is going to move: it is drawn once, and the picture of it is moved.
    private void Hold()
    {
        if (moved != null) {
            moved.RenderTransformOrigin = Origin;
            moved.RenderTransform = transform;
        }

        if (Cached)
            (moved ?? faded).CacheMode = cache;
    }

    // Draws it where it ends: in place, with nothing on it that is not there when it is not moving, or gone.
    private void Arrive(double to)
    {
        fade.Rest(to);
        move.Rest(to);
        dim.Rest(to);
        Apply();
        if (Cached)
            (moved ?? faded).CacheMode = null;
        if (to >= 1 && moved != null)
            moved.RenderTransform = null;
    }
}
