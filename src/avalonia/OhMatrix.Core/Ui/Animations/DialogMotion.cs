using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The motion of a dialog, the way the reference page does it (<c>animations-lab/dialog</c>): the card grows from 60% of its size from its
/// centre along <c>--arc</c>, which goes 7.5% past its size (half the overshoot of the page) and settles on it in 0.3 s, and its opacity comes in over 80 ms; the backdrop fades in
/// over 200 ms. Closing takes 100 ms: the card shrinks back to 60% and fades, and the backdrop goes. Each value is a CSS-style transition
/// (<see cref="Tween"/>), so a dialog that is opened again while it closes turns round from where it is.
/// </summary>
internal sealed class DialogMotion {
    // The numbers of the reference page, in seconds: the card grows in 0.3 s,
    // its opacity in 40% of the opening time, the backdrop in the opening
    // time, and all of it closes in 0.1 s.
    private const double OpenSeconds = 0.2;
    private const double GrowSeconds = 0.3;
    private const double FadeSeconds = OpenSeconds * 0.4;
    private const double CloseSeconds = 0.1;
    private const double FromScale = 0.6;

    private readonly Control card;
    private readonly ScaleTransform scale = new(FromScale, FromScale);
    private readonly Tween size = new(FromScale);
    private readonly Tween fade = new(0);
    private readonly Tween dim = new(0);

    // A motion is running, and which one: a motion that was replaced stops at
    // its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;

    // The dialog is going away: when it has gone, the one who took it away is
    // told, once.
    private bool closing;
    private Action? onGone;

    public DialogMotion(Control card)
    {
        this.card = card;
        card.RenderTransformOrigin = RelativePoint.Center;
        card.RenderTransform = scale;
        card.Opacity = 0;
    }

    /// <summary>The brush that dims the window behind the dialog: it is faded in and out with it.</summary>
    public Brush? Backdrop { get; set; }

    /// <summary>It is going away.</summary>
    public bool Closing => closing;

    /// <summary>Shows the dialog: the card grows from its centre, and the backdrop comes in.</summary>
    public void Open()
    {
        closing = false;
        onGone = null;
        size.Go(1, Seconds(GrowSeconds), Curves.Arc);
        fade.Go(1, Seconds(FadeSeconds), Curves.EaseOut);
        dim.Go(1, Seconds(OpenSeconds), Curves.EaseOut);
        // The first frame is not waited for: what is drawn now is where it is.
        Apply();
        Begin();
    }

    /// <summary>Takes the dialog away: it shrinks back and fades, and <paramref name="onGone"/> is called when it has gone.</summary>
    public void Close(Action onGone)
    {
        if (closing)
            return;
        closing = true;
        this.onGone = onGone;
        size.Go(FromScale, Seconds(CloseSeconds), Curves.EaseClose);
        fade.Go(0, Seconds(CloseSeconds), Curves.EaseOut);
        dim.Go(0, Seconds(CloseSeconds), Curves.EaseOut);
        Begin();
    }

    /// <summary>Stops at once, and nothing is said to have gone. The next <see cref="Open"/> starts from nothing.</summary>
    public void Stop()
    {
        session++;
        running = false;
        closing = false;
        onGone = null;
        size.Rest(FromScale);
        fade.Rest(0);
        dim.Rest(0);
        Apply();
    }

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
        size.Step(now);
        fade.Step(now);
        dim.Step(now);
        Apply();
        if (Moving() && Motion.Frames(card, next))
            return;
        running = false;
        Finish();
    }

    private bool Moving() => size.Moving || fade.Moving || dim.Moving;

    // Puts all that moves where it is sent, at once.
    private void Settle()
    {
        size.Rest(size.Target);
        fade.Rest(fade.Target);
        dim.Rest(dim.Target);
        Apply();
        Finish();
    }

    // The dialog has come to rest: if it was going away, it is gone now.
    private void Finish()
    {
        if (!closing)
            return;
        closing = false;
        var done = onGone;
        onGone = null;
        done?.Invoke();
    }

    private void Apply()
    {
        scale.ScaleX = size.Value;
        scale.ScaleY = size.Value;
        card.Opacity = Math.Clamp(fade.Value, 0, 1);
        if (Backdrop != null)
            Backdrop.Opacity = Math.Clamp(dim.Value, 0, 1);
    }

    // What a time of the reference page is now: none when motion is off, and
    // stretched by the slowdown of the app.
    private static double Seconds(double seconds) =>
        Motion.Enabled ? seconds * Motion.Slowdown : 0;
}
