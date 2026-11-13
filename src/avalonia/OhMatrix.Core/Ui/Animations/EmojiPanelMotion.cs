using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace OhMatrix.Core.Ui.Animations;

/// <summary>
/// The motion of the emoji panel, the way the reference page does it (<c>animations-lab/emoji-panel</c>): the panel grows from a quarter of its
/// size, from the corner of the button it opens from, along <c>--arc</c> (it goes 15% past its size and settles) in 0.5 s while its opacity comes in
/// over 0.15 s; and the emoji pop out one ring after another from the middle of the panel, each from nothing and
/// turned back 25 degrees, 30 ms for each ring after the first 60 ms, over 0.4 s with the quick overshoot of <c>--pop</c>. Closing takes 0.16 s for
/// the panel, which shrinks with an ease-in, and 0.1 s for the emoji. Each value is a CSS-style transition (<see cref="Tween"/>), so a panel that is
/// opened again while it closes turns round from where it is.
/// </summary>
internal sealed class EmojiPanelMotion {
    private const double OpenSeconds = 0.5;
    private const double CloseSeconds = 0.16;
    private const double PanelFade = 0.15;
    private const double ItemSeconds = 0.4;
    private const double ItemFade = 0.15;
    private const double ItemClose = 0.1;
    private const double FirstItem = 0.06;
    private const double Ring = 0.03;
    private const double FromScale = 0.25;

    // The name of the group fades in when the panel has got to the top of its
    // overshoot, which --arc reaches at a fifth of its time.
    private const double PeakAt = 0.2;
    private const double NameDelay = OpenSeconds * PeakAt;
    private const double NameSeconds = 0.25;

    private const double FromTurn = -25;

    // One emoji on its way in: it comes from nothing and from a turn.
    private sealed class Piece {
        public Piece(Control control, double ring)
        {
            Control = control;
            Ring = ring;
            Group = new TransformGroup {
                Children = {
                    Scale,
                    Turned
                }
            };
        }

        public Control Control { get; }
        public double Ring { get; }
        public ScaleTransform Scale { get; } = new(0, 0);
        public RotateTransform Turned { get; } = new(FromTurn);
        public TransformGroup Group { get; }
        public Tween Fade { get; } = new(0);
        public Tween Size { get; } = new(0);
        public Tween Turn { get; } = new(FromTurn);

        public bool Moving => Fade.Moving || Size.Moving || Turn.Moving;
    }

    private readonly Control panel;
    private readonly ScaleTransform scale = new(FromScale, FromScale);
    private readonly Tween size = new(FromScale);
    private readonly Tween fade = new(0);
    private List<Piece> pieces = [];
    private readonly Tween nameFade = new(0);
    private Control? heading;

    // Where the tiles stand, so that tiles that are made again while the panel
    // is coming in can be brought in too, and when it was opened.
    private int columns;
    private int rows;
    private double openedAt;

    // A motion is running, and which one: a motion that was replaced stops at
    // its next frame, when it sees that it is not the one any more.
    private bool running;
    private int session;

    // The clock of the motion. The first frame of the panel can take a long
    // time (its emoji are laid out and drawn for the first time), and the
    // frames after it are late: a motion that went by the clock of the
    // screen would be over before it was seen. A frame moves it on by 1/30 s
    // at most, so a late frame is shown as a slow one and nothing is skipped.
    private const double LongestStep = 1.0 / 30;
    private double? seen;
    private double clockTime;

    // The panel is going away: when it has gone, the one who took it away is
    // told, once.
    private bool closing;
    private Action? onGone;

    public EmojiPanelMotion(Control panel)
    {
        this.panel = panel;
        panel.Opacity = 0;
    }

    /// <summary>It is going away.</summary>
    public bool Closing => closing;

    /// <summary>The panel or an emoji is on its way: what is under the pointer is not touched meanwhile.</summary>
    public bool Busy => running || closing;

    /// <summary>
    /// Shows the panel, growing from <paramref name="origin"/> (a point of the panel, where the button is), with the first
    /// <paramref name="columns"/> by <paramref name="rows"/> of <paramref name="tiles"/> popping out from the middle of that block.
    /// </summary>
    public void Open(RelativePoint origin, IReadOnlyList<Control> tiles,
        int columns, int rows, IReadOnlyList<Control>? covers = null,
        Control? name = null)
    {
        closing = false;
        onGone = null;
        panel.RenderTransformOrigin = origin;
        Restore();
        this.columns = columns;
        this.rows = rows;
        pieces = Pieces(tiles, covers);
        size.Rest(FromScale);
        fade.Rest(0);
        size.Go(1, Seconds(OpenSeconds), Curves.FullArc);
        fade.Go(1, Seconds(PanelFade), Curves.Ease);
        foreach (var piece in pieces)
            Bring(piece, 0);
        heading = name;
        nameFade.Rest(0);
        nameFade.Go(1, Seconds(NameSeconds), Curves.Ease, Seconds(NameDelay));
        Apply();
        Begin();
        openedAt = clockTime;
    }

    /// <summary>
    /// The tiles were made again while the panel is coming in (the stickers were loaded): the new ones are brought in as the ones they
    /// replace were, from the point of the motion it has got to. Once it is over they are left as they are.
    /// </summary>
    public void Retile(IReadOnlyList<Control> tiles,
        IReadOnlyList<Control>? covers = null, Control? name = null)
    {
        if (closing || !running)
            return;
        pieces = Pieces(tiles, covers);
        // The name is a new control, shown from where the old one had got to.
        heading = name;
        var elapsed = clockTime - openedAt;
        foreach (var piece in pieces)
            Bring(piece, elapsed);
        Apply();
    }

    // The first columns by rows of the tiles, each with its distance from the
    // middle of that block, which is when it comes.
    private List<Piece> Pieces(IReadOnlyList<Control> tiles,
        IReadOnlyList<Control>? covers)
    {
        var shown = Math.Max(1, columns);
        var tall = Math.Max(1, rows);
        var list = tiles.Take(shown * tall).Select((t, i) =>
            new Piece(t, Math.Sqrt(
                Math.Pow(i % shown - (shown - 1) / 2.0, 2) +
                Math.Pow(i / shown - (tall - 1) / 2.0, 2)))).ToList();
        // The covers of the groups are a row under the block, and come as the
        // next ring of it: the farther from the middle, the later.
        var below = (tall - 1) / 2.0 + 1.5;
        var seen = covers?.Take(shown + 1).ToList() ?? [];
        for (var i = 0; i < seen.Count; i++)
            list.Add(new Piece(seen[i], Math.Sqrt(
                Math.Pow(i - (seen.Count - 1) / 2.0, 2) + below * below)));
        return list;
    }

    // Sends a tile in: it waits for its ring, less the time that has gone.
    private static void Bring(Piece piece, double elapsed)
    {
        var wait = Math.Max(0,
            Seconds(FirstItem + piece.Ring * Ring) - elapsed);
        piece.Fade.Go(1, Seconds(ItemFade), Curves.Ease, wait);
        piece.Size.Go(1, Seconds(ItemSeconds), Curves.Pop, wait);
        piece.Turn.Go(0, Seconds(ItemSeconds), Curves.Pop, wait);
    }

    /// <summary>Takes the panel away: it shrinks and fades, and <paramref name="onGone"/> is called when it has gone.</summary>
    public void Close(Action onGone)
    {
        if (closing)
            return;
        closing = true;
        this.onGone = onGone;
        size.Go(FromScale, Seconds(CloseSeconds), Curves.Accelerate);
        fade.Go(0, Seconds(CloseSeconds), Curves.Ease);
        foreach (var piece in pieces) {
            piece.Fade.Go(0, Seconds(ItemClose), Curves.Ease);
            piece.Size.Go(0, Seconds(ItemClose), Curves.Ease);
            piece.Turn.Go(FromTurn, Seconds(ItemClose), Curves.Ease);
        }

        Begin();
    }

    /// <summary>Stops at once, and nothing is said to have gone. The next <see cref="Open"/> starts from nothing.</summary>
    public void Stop()
    {
        session++;
        running = false;
        closing = false;
        onGone = null;
        seen = null;
        nameFade.Rest(0);
        if (heading != null)
            heading.Opacity = 1;
        heading = null;
        size.Rest(FromScale);
        fade.Rest(0);
        Restore();
        pieces = [];
        Apply();
    }

    // The emoji of the last time are put in their place and left alone.
    private void Restore()
    {
        foreach (var piece in pieces) {
            piece.Control.Opacity = 1;
            piece.Control.RenderTransform = null;
        }
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
        seen = null;
        var id = ++session;

        void Tick(TimeSpan now)
        {
            if (id == session)
                Frame(now.TotalSeconds, Tick);
        }

        // In no window there is no frame to wait for.
        if (Motion.Frames(panel, Tick))
            return;
        running = false;
        Settle();
    }

    private void Frame(double real, Action<TimeSpan> next)
    {
        var now = Advance(real);
        size.Step(now);
        fade.Step(now);
        nameFade.Step(now);
        foreach (var piece in pieces) {
            piece.Fade.Step(now);
            piece.Size.Step(now);
            piece.Turn.Step(now);
        }

        Apply();
        if (Moving() && Motion.Frames(panel, next))
            return;
        running = false;
        Finish();
    }

    // The time of the motion at a frame that came at <real>.
    private double Advance(double real)
    {
        clockTime +=
            seen == null ? 0 : Math.Min(real - seen.Value, LongestStep);
        seen = real;
        return clockTime;
    }

    private bool Moving() =>
        size.Moving || fade.Moving || nameFade.Moving ||
        pieces.Any(p => p.Moving);

    // Puts all that moves where it is sent, at once.
    private void Settle()
    {
        size.Rest(size.Target);
        fade.Rest(fade.Target);
        nameFade.Rest(nameFade.Target);
        foreach (var piece in pieces) {
            piece.Fade.Rest(piece.Fade.Target);
            piece.Size.Rest(piece.Size.Target);
            piece.Turn.Rest(piece.Turn.Target);
        }

        Apply();
        Finish();
    }

    // The panel has come to rest: if it was going away, it is gone now.
    private void Finish()
    {
        if (!closing)
            return;
        closing = false;
        var done = onGone;
        onGone = null;
        done?.Invoke();
    }

    // Draws the panel as it is now. A transform is set only while something is
    // off its place, so that what is in place is drawn sharp.
    private void Apply()
    {
        panel.Opacity = Math.Clamp(fade.Value, 0, 1);
        if (size.Moving || size.Value != 1) {
            scale.ScaleX = size.Value;
            scale.ScaleY = size.Value;
            panel.RenderTransform = scale;
        } else
            panel.RenderTransform = null;

        // The name comes in a moment after the tiles.
        if (heading != null)
            heading.Opacity = Math.Clamp(nameFade.Value, 0, 1);
        foreach (var piece in pieces) {
            piece.Control.Opacity = Math.Clamp(piece.Fade.Value, 0, 1);
            if (piece.Moving || piece.Size.Value != 1 ||
                piece.Turn.Value != 0) {
                piece.Scale.ScaleX = piece.Size.Value;
                piece.Scale.ScaleY = piece.Size.Value;
                piece.Turned.Angle = piece.Turn.Value;
                piece.Control.RenderTransform = piece.Group;
            } else
                piece.Control.RenderTransform = null;
        }
    }

    // What a time of the reference page is now: none when motion is off, and
    // stretched by the slowdown of the app.
    private static double Seconds(double seconds) =>
        Motion.Enabled ? seconds * Motion.Slowdown : 0;
}

/// <summary>
/// An emoji under the pointer, as the reference page has it: it grows to 1.3 times its size and turns 8 degrees back in 0.25 s with the
/// overshoot of <c>--pop</c>, and comes back in 0.4 s.
/// </summary>
internal sealed class EmojiHover {
    private readonly Control tile;
    private readonly ScaleTransform scale = new(1, 1);
    private readonly RotateTransform turned = new(0);
    private readonly TransformGroup group;
    private readonly Tween size = new(1);
    private readonly Tween turn = new(0);
    private bool running;
    private int session;

    public EmojiHover(Control tile)
    {
        this.tile = tile;
        group = new TransformGroup {
            Children = {
                scale,
                turned
            }
        };
    }

    /// <summary>The pointer is over the emoji, or has left it.</summary>
    public void To(bool over)
    {
        var seconds =
            Motion.Enabled ? (over ? 0.25 : 0.4) * Motion.Slowdown : 0;
        size.Go(over ? 1.3 : 1, seconds, Curves.Pop);
        turn.Go(over ? -8 : 0, seconds, Curves.Pop);
        if (!Motion.Enabled) {
            size.Rest(size.Target);
            turn.Rest(turn.Target);
            Apply();
            return;
        }

        if (running)
            return;
        running = true;
        var id = ++session;

        void Tick(TimeSpan now)
        {
            if (id != session)
                return;
            size.Step(now.TotalSeconds);
            turn.Step(now.TotalSeconds);
            Apply();
            if ((size.Moving || turn.Moving) && Motion.Frames(tile, Tick))
                return;
            running = false;
        }

        if (!Motion.Frames(tile, Tick)) {
            running = false;
            size.Rest(size.Target);
            turn.Rest(turn.Target);
            Apply();
        }
    }

    private void Apply()
    {
        if (size.Moving || size.Value != 1 || turn.Value != 0) {
            scale.ScaleX = size.Value;
            scale.ScaleY = size.Value;
            turned.Angle = turn.Value;
            tile.RenderTransform = group;
        } else
            tile.RenderTransform = null;
    }
}
