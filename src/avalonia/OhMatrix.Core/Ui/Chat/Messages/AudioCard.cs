using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Infra.Logging;

namespace OhMatrix.Core.Ui.Chat.Messages;

/// <summary>
/// An audio message with playback controls, progress and time. Players are
/// kept by message, so playback survives its card leaving the visual tree.
/// </summary>
public sealed class AudioCard : Grid {
    private static readonly Logger logger = Logger.GetDefault();

    // Every audio bubble has the same width, and the waveform (or the bar)
    // runs the whole of it.
    private const double Wide = 220;

    private static readonly Dictionary<string, MediaPlayer> Players = new();

    private readonly FileAttachment file;
    private readonly Func<FileAttachment, Task<string?>> fetch;
    private readonly Action fallback;

    private readonly Bars bars;

    private readonly TextBlock name = new() {
        FontSize = 15,
        FontWeight = FontWeight.Medium,
        TextTrimming = TextTrimming.CharacterEllipsis,
    };

    private readonly Border back = new() {
        Height = 3,
        CornerRadius = new CornerRadius(1.5),
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border fill = new() {
        Height = 3,
        CornerRadius = new CornerRadius(1.5),
        HorizontalAlignment = HorizontalAlignment.Left,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly TextBlock time = new() {
        FontSize = 12,
        Margin = new Thickness(0, 1, 0, 0),
    };

    private readonly SolidColorBrush playedFill = new();
    private readonly SolidColorBrush restFill = new();
    private readonly SolidColorBrush metaFill = new();

    private readonly DispatcherTimer timer = new() {
        Interval = TimeSpan.FromMilliseconds(250)
    };

    private bool loading;
    private string glyph = "play";

    public AudioCard(
        FileAttachment file,
        ColorTokens colors,
        bool mine,
        IBrush fg,
        Color meta,
        Func<FileAttachment, Task<string?>> fetch,
        Action fallback
    )
    {
        this.file = file;
        this.fetch = fetch;
        this.fallback = fallback;
        Width = Wide;
        // The whole card takes the press: there is no play button and no
        // seeking, the press plays and pauses.
        Background = Brushes.Transparent;
        Cursor = new Cursor(StandardCursorType.Hand);
        var stack = new StackPanel();
        if (file.Voice) {
            bars = new Bars(file.Waveform, file.Name, Wide, playedFill,
                restFill);
            stack.Children.Add(bars);
        } else {
            bars = new Bars(null, "", Wide, playedFill, restFill);
            name.Text = file.Name;
            back.Background = restFill;
            fill.Background = playedFill;
            var line = new Grid {
                Height = 10
            };
            line.Children.Add(back);
            line.Children.Add(fill);
            stack.Children.Add(name);
            stack.Children.Add(line);
        }

        time.Foreground = metaFill;
        stack.Children.Add(time);
        Children.Add(stack);
        PointerPressed += (_, e) => {
            e.Handled = true;
            _ = Toggle();
        };
        timer.Tick += (_, _) => Refresh();
        AttachedToVisualTree += (_, _) => {
            Refresh();
            timer.Start();
        };
        DetachedFromVisualTree += (_, _) => timer.Stop();
        UpdatePresentation(colors, mine, fg, meta);
        Refresh();
    }

    /// <summary>Updates colors and fonts without changing playback.</summary>
    public void UpdatePresentation(ColorTokens colors, bool mine, IBrush fg,
        Color meta)
    {
        // The bars are the colour of the text of the bubble: what is played in
        // full, what is not at half of it, so that the progress can be seen.
        var ink = fg is ISolidColorBrush text
            ? text.Color
            : mine
                ? colors.BubbleOutText
                : colors.BubbleInText;
        playedFill.Color = ink;
        restFill.Color = Color.FromArgb(128, ink.R, ink.G, ink.B);
        metaFill.Color = meta;
        name.Foreground = fg;
        // The time keeps clear of the time of the message, which is drawn over
        // its end.
        time.Margin = new Thickness(0, 1, mine ? 62 : 44, 0);
        bars.InvalidateVisual();
    }

    /// <summary>What the clip is doing now: "play" when it is not playing, "pause" when it is.</summary>
    public string Glyph => glyph;

    public long Position =>
        Players.TryGetValue(file.Source, out var p) ? p.PositionMs : 0;

    /// <summary>Starts the clip (fetching it first) or pauses it; the program of the system takes over where there is no player library.</summary>
    public async Task Toggle()
    {
        if (loading)
            return;
        if (Players.TryGetValue(file.Source, out var running)) {
            if (running.State == PlayState.Playing)
                running.Pause();
            else if (!running.Play())
                fallback();
            Refresh();
            return;
        }

        if (!MediaPlayer.Available) {
            fallback();
            return;
        }

        loading = true;
        try {
            var path = await fetch(file);
            if (path == null)
                return;
            var player = new MediaPlayer(path);
            // Few clips are kept: the oldest one that is not playing goes.
            if (Players.Count >= 8 &&
                Players.FirstOrDefault(p => p.Value.State != PlayState.Playing)
                    is { Value: not null } old) {
                old.Value.Dispose();
                Players.Remove(old.Key);
            }

            Players[file.Source] = player;
            if (!player.Play())
                fallback();
        } catch (Exception e) {
            logger.Unexpected("AudioCard", e);
            fallback();
        } finally {
            loading = false;
            Refresh();
        }
    }

    /// <summary>Shows where the clip is now; the card does it by itself every quarter of a second while it is on screen.</summary>
    public void Refresh()
    {
        Players.TryGetValue(file.Source, out var player);
        var playing = player?.State == PlayState.Playing;
        glyph = playing ? "pause" : "play";
        var length = player is { DurationMs: > 0 }
            ? player.DurationMs
            : (long)(file.Duration?.TotalMilliseconds ?? 0);
        var at = player?.State == PlayState.Ended ? 0 : player?.PositionMs ?? 0;
        var share = length > 0 ? Math.Min(1.0, (double)at / length) : 0;
        bars.Progress = share;
        fill.Width = Math.Max(0, Wide * share);
        time.Text = playing || at > 0
            ? $"{Format.Duration(TimeSpan.FromMilliseconds(at))} / {Format.Duration(TimeSpan.FromMilliseconds(length))}"
            : Format.Duration(TimeSpan.FromMilliseconds(length));
    }

    /// <summary>
    /// The bars of a voice message (<c>Waveform</c> of the React Native app): 3 wide and 2 apart, 3 to 26 high, one for each 5 px of the width,
    /// the played ones in the strong colour. A message without samples gets a gentle fixed pattern from its name.
    /// </summary>
    private sealed class Bars : Control {
        private const double Tall = 26;
        private readonly IReadOnlyList<double> heights;
        private readonly IBrush played;
        private readonly IBrush rest;

        public Bars(IReadOnlyList<float>? samples, string seed, double width,
            IBrush played, IBrush rest)
        {
            this.played = played;
            this.rest = rest;
            var count = Math.Max(12, (int)Math.Floor(width / 5));
            var list = new double[count];
            uint x = 0;
            foreach (var ch in seed)
                x = unchecked(x * 31 + ch);
            for (var i = 0; i < count; i++)
                list[i] = samples is { Count: > 0 }
                    ? samples[Math.Min(samples.Count - 1,
                        (int)Math.Floor((double)i / count * samples.Count))]
                    : 0.25 + 0.55 * Math.Abs(Math.Sin((i + 1) * 1.7 + x));
            heights = list;
            Width = width;
            Height = samples == null && seed.Length == 0 ? 0 : Tall;
        }

        /// <summary>How much of the message has been played, from 0 to 1.</summary>
        public double Progress {
            get;
            set {
                if (field == value)
                    return;
                field = value;
                InvalidateVisual();
            }
        }

        public override void Render(DrawingContext context)
        {
            var count = heights.Count;
            for (var i = 0; i < count; i++) {
                var h = Math.Max(3, Math.Round(heights[i] * Tall));
                context.DrawRectangle((double)i / count < Progress
                        ? played
                        : rest, null,
                    new RoundedRect(
                        new Rect(i * 5, (Bounds.Height - h) / 2, 3, h), 1.5));
            }
        }
    }
}
