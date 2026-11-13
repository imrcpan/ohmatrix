using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The pop-up window, the way the reference page does it (<c>animations-lab/pop-up-window</c>): the backdrop fades in over 300 ms, the window
/// falls from above the top edge of the window with a light overshoot and fades in, and its items rise 12 px one after the other, 30 ms apart,
/// the first 80 ms after it starts. Closing takes 150 ms: the window goes back up with ease-in, and the items sink in 50 ms. Each value is a
/// CSS-style transition (<see cref="Tween"/>), so a window that is opened again while it closes turns round from where it is.
/// </summary>
internal sealed class FallWindow {
    // The numbers of the reference page, in seconds: the window's open and
    // close transitions, and the items' fade, their first wait and their
    // stagger, and their close.
    private const double OpenSeconds = 0.3;
    private const double CloseSeconds = 0.15;
    private const double ItemFade = 0.2;
    private const double ItemFirst = 0.08;
    private const double Stagger = 0.03;
    private const double ItemCloseSeconds = 0.05;
    private const double Rise = 12;

    private sealed class Item {
        public Item(Control control)
        {
            Control = control;
            Transform = new TranslateTransform(0, Rise);
            Fade = new Tween(0);
            Shift = new Tween(Rise);
        }

        public Control Control { get; }
        public TranslateTransform Transform { get; }
        public Tween Fade { get; }
        public Tween Shift { get; }

        public bool Moving => Fade.Moving || Shift.Moving;
    }

    private readonly Control backdrop;
    private readonly Control card;
    private readonly TranslateTransform fall = new();
    private readonly Tween dim = new(0);
    private readonly Tween fade = new(0);
    private readonly Tween drop = new(0);
    private List<Item> items = [];
    private double height;

    // The window is on the screen (opening, open or closing), and it is going
    // away: when it has gone, the one who took it away is told, once.
    private bool shown;
    private bool closing;
    private Action? onGone;

    // A motion is running, and which one: a motion that was replaced stops at
    // its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;

    public FallWindow(Control backdrop, Control card)
    {
        this.backdrop = backdrop;
        this.card = card;
        backdrop.Opacity = 0;
        card.Opacity = 0;
    }

    /// <summary>It is going away.</summary>
    public bool Closing => closing;

    /// <summary>
    /// Shows the window with <paramref name="content"/> as its items, falling from <paramref name="viewport"/> above its place. Opened while it
    /// is going away, it turns round from where it is; opened with items that are new, the new ones come in the same way.
    /// </summary>
    public void Open(double viewport, IReadOnlyList<Control> content)
    {
        closing = false;
        onGone = null;
        height = viewport;
        Attach(content);
        if (!shown) {
            dim.Rest(0);
            fade.Rest(0);
            drop.Rest(-viewport);
        }

        shown = true;
        dim.Go(1, Seconds(OpenSeconds), Curves.Ease);
        drop.Go(0, Seconds(OpenSeconds), Curves.Drop);
        fade.Go(1, Seconds(OpenSeconds), Curves.Ease);
        for (var i = 0; i < items.Count; i++) {
            var item = items[i];
            var wait = Seconds(ItemFirst + i * Stagger);
            item.Fade.Go(1, Seconds(ItemFade), Curves.Ease, wait);
            item.Shift.Go(0, Seconds(OpenSeconds), Curves.Drop, wait);
        }

        Apply();
        Begin();
    }

    /// <summary>Takes the window away: it goes back up and fades, and <paramref name="onGone"/> is called when it has gone.</summary>
    public void Close(Action onGone)
    {
        if (closing)
            return;
        closing = true;
        this.onGone = onGone;
        dim.Go(0, Seconds(CloseSeconds), Curves.Ease);
        drop.Go(-height, Seconds(CloseSeconds), Curves.EaseIn);
        fade.Go(0, Seconds(CloseSeconds), Curves.Ease);
        foreach (var item in items) {
            item.Fade.Go(0, Seconds(ItemCloseSeconds), Curves.Ease);
            item.Shift.Go(Rise, Seconds(ItemCloseSeconds), Curves.Ease);
        }

        Begin();
    }

    // The items are the ones it is given. Items that are new start hidden,
    // and the ones of the last time are not moved any more.
    private void Attach(IReadOnlyList<Control> content)
    {
        if (items.Count == content.Count &&
            items.Select((item, i) => ReferenceEquals(item.Control, content[i]))
                .All(same => same))
            return;
        items = [.. content.Select(control => new Item(control))];
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
        if (Motion.Frames(card, Tick))
            return;
        running = false;
        Settle();
    }

    private void Frame(double now, Action<TimeSpan> next)
    {
        dim.Step(now);
        fade.Step(now);
        drop.Step(now);
        foreach (var item in items) {
            item.Fade.Step(now);
            item.Shift.Step(now);
        }

        Apply();
        if (Moving() && Motion.Frames(card, next))
            return;
        running = false;
        Finish();
    }

    private bool Moving() =>
        dim.Moving || fade.Moving || drop.Moving || items.Any(i => i.Moving);

    // Puts all that moves where it is sent, at once.
    private void Settle()
    {
        dim.Rest(dim.Target);
        fade.Rest(fade.Target);
        drop.Rest(drop.Target);
        foreach (var item in items) {
            item.Fade.Rest(item.Fade.Target);
            item.Shift.Rest(item.Shift.Target);
        }

        Apply();
        Finish();
    }

    // The window has come to rest: if it was going away, it is gone now.
    private void Finish()
    {
        if (!closing)
            return;
        closing = false;
        shown = false;
        var done = onGone;
        onGone = null;
        done?.Invoke();
    }

    // Draws the window as it is now. A transform is set only while something is
    // off its place, so that what is in place is drawn sharp.
    private void Apply()
    {
        backdrop.Opacity = Math.Clamp(dim.Value, 0, 1);
        card.Opacity = Math.Clamp(fade.Value, 0, 1);
        if (drop.Moving || drop.Value != 0) {
            fall.Y = drop.Value;
            card.RenderTransform = fall;
        } else
            card.RenderTransform = null;

        foreach (var item in items) {
            item.Control.Opacity = Math.Clamp(item.Fade.Value, 0, 1);
            if (item.Shift.Moving || item.Shift.Value != 0) {
                item.Transform.Y = item.Shift.Value;
                item.Control.RenderTransform = item.Transform;
            } else
                item.Control.RenderTransform = null;
        }
    }

    // What a time of the reference page is now: none when motion is off, and
    // stretched by the slowdown of the app.
    private static double Seconds(double seconds) =>
        Motion.Enabled ? seconds * Motion.Slowdown : 0;
}
