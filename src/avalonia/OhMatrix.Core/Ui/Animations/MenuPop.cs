using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The pop of a menu, the way button 1 of the reference page does it (<c>animations-lab/menu-open</c>, the variant without <c>data-variant=smooth</c>):
/// the menu grows from half its size and fades in with an overshoot of about a tenth, and its rows come down 8 px and fade in one after the
/// other, 30 ms apart, the first 60 ms after the menu starts. Closing takes 150 ms with no overshoot, and the rows go with the menu. Each value
/// is a CSS-style transition (<see cref="Tween"/>), so a menu that is shown again while it is closing turns round from where it is.
/// </summary>
internal sealed class MenuPop {
    // The numbers of the reference page, in seconds. The page sets each
    // property's transition from these: the menu's opacity is 40% of the
    // opening time, its rows' 70%, and closing takes 80% of its time for the
    // opacity and all of it for the size.
    private const double OpenFade = 0.35 * 0.4;
    private const double OpenSeconds = 0.35;
    private const double RowFade = 0.35 * 0.7;
    private const double CloseSeconds = 0.15;
    private const double CloseFade = 0.15 * 0.8;
    private const double RowClose = 0.1;
    private const double Stagger = 0.03;
    private const double FirstRow = 0.06;
    private const double FromScale = 0.5;
    private const double FromShift = -8;

    private sealed class Row {
        public Row(Control control)
        {
            Control = control;
            Transform = new TranslateTransform(0, FromShift);
            Fade = new Tween(0);
            Shift = new Tween(FromShift);
        }

        public Control Control { get; }
        public TranslateTransform Transform { get; }
        public Tween Fade { get; }
        public Tween Shift { get; }

        public bool Moving => Fade.Moving || Shift.Moving;
    }

    private readonly Control surface;
    private readonly ScaleTransform scale = new(FromScale, FromScale);
    private readonly Tween fade = new(0);
    private readonly Tween size = new(FromScale);
    private List<Row> rows = [];

    // A motion is running, and which one: a motion that was replaced stops at
    // its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;

    // The menu is going away: when it has gone, the one who took it away is
    // told, once.
    private bool closing;
    private Action? onGone;

    public MenuPop(Control surface)
    {
        this.surface = surface;
        surface.Opacity = 0;
    }

    /// <summary>It is going away.</summary>
    public bool Closing => closing;

    /// <summary>
    /// Shows the menu with <paramref name="items"/> as its rows, growing from <paramref name="origin"/> (the corner it opens from). If it is on
    /// its way out it turns round from where it is; otherwise it starts from nothing.
    /// </summary>
    public void Open(IReadOnlyList<Control> items, RelativePoint origin)
    {
        closing = false;
        onGone = null;
        surface.RenderTransformOrigin = origin;
        Attach(items);
        fade.Go(1, Seconds(OpenFade), Curves.EaseOut);
        size.Go(1, Seconds(OpenSeconds), Curves.Overshoot);
        for (var i = 0; i < rows.Count; i++) {
            var row = rows[i];
            var wait = Seconds(FirstRow + i * Stagger);
            row.Fade.Go(1, Seconds(RowFade), Curves.Ease, wait);
            row.Shift.Go(0, Seconds(OpenSeconds), Curves.Overshoot, wait);
        }

        Begin();
    }

    /// <summary>Takes the menu away: it shrinks back and fades, and <paramref name="onGone"/> is called when it has gone.</summary>
    public void Close(Action onGone)
    {
        if (closing)
            return;
        closing = true;
        this.onGone = onGone;
        fade.Go(0, Seconds(CloseFade), Curves.Ease);
        size.Go(FromScale, Seconds(CloseSeconds), Curves.EaseIn);
        foreach (var row in rows) {
            row.Fade.Go(0, Seconds(RowClose), Curves.Ease);
            row.Shift.Go(FromShift, Seconds(RowClose), Curves.Ease);
        }

        Begin();
    }

    /// <summary>Stops at once, and is closed: nothing is said to have gone. The next <see cref="Open"/> starts from nothing.</summary>
    public void Stop()
    {
        session++;
        running = false;
        closing = false;
        onGone = null;
        fade.Rest(0);
        size.Rest(FromScale);
        foreach (var row in rows) {
            row.Fade.Rest(0);
            row.Shift.Rest(FromShift);
        }

        Apply();
    }

    // The rows of the menu are the ones it is given. Rows that are new start
    // closed, and the ones of the last time are not moved any more.
    private void Attach(IReadOnlyList<Control> items)
    {
        if (rows.Count == items.Count &&
            rows.Select((r, i) => ReferenceEquals(r.Control, items[i]))
                .All(same => same))
            return;
        rows = [.. items.Select(item => new Row(item))];
        Apply();
    }

    // Starts the motion, unless it is running already: the running one sees
    // what has been sent to it at its next frame.
    private void Begin()
    {
        if (!Motion.Enabled) {
            Settle();
            return;
        }

        if (running)
            return;
        running = true;
        var id = ++session;

        void Tick(TimeSpan now)
        {
            if (id == session)
                Frame(now.TotalSeconds, Tick);
        }

        // In no window there is no frame to wait for.
        if (Motion.Frames(surface, Tick))
            return;
        running = false;
        Settle();
    }

    private void Frame(double now, Action<TimeSpan> next)
    {
        fade.Step(now);
        size.Step(now);
        foreach (var row in rows) {
            row.Fade.Step(now);
            row.Shift.Step(now);
        }

        Apply();
        if (Moving() && Motion.Frames(surface, next))
            return;
        running = false;
        Finish();
    }

    private bool Moving() =>
        fade.Moving || size.Moving || rows.Any(r => r.Moving);

    // Puts all that moves where it is sent, at once.
    private void Settle()
    {
        fade.Rest(fade.Target);
        size.Rest(size.Target);
        foreach (var row in rows) {
            row.Fade.Rest(row.Fade.Target);
            row.Shift.Rest(row.Shift.Target);
        }

        Apply();
        Finish();
    }

    // The menu has come to rest: if it was going away, it is gone now.
    private void Finish()
    {
        if (!closing)
            return;
        closing = false;
        var done = onGone;
        onGone = null;
        done?.Invoke();
    }

    // Draws the menu as it is now. A transform is set only while something is
    // off its place, so that what is in place is drawn sharp.
    private void Apply()
    {
        surface.Opacity = Math.Clamp(fade.Value, 0, 1);
        if (size.Moving || size.Value != 1) {
            scale.ScaleX = size.Value;
            scale.ScaleY = size.Value;
            surface.RenderTransform = scale;
        } else
            surface.RenderTransform = null;

        foreach (var row in rows) {
            row.Control.Opacity = Math.Clamp(row.Fade.Value, 0, 1);
            if (row.Shift.Moving || row.Shift.Value != 0) {
                row.Transform.Y = row.Shift.Value;
                row.Control.RenderTransform = row.Transform;
            } else
                row.Control.RenderTransform = null;
        }
    }

    // What a time of the reference page is now: none when motion is off, and
    // stretched by the slowdown of the app.
    private static double Seconds(double seconds) =>
        Motion.Enabled ? seconds * Motion.Slowdown : 0;
}
