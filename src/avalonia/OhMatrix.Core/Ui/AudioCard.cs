using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Threading;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;

namespace OhMatrix.Core.Ui;

/// <summary>
/// The card of an audio message that plays in the app: a play or pause button, the name, a bar to see and change where it is, and the time. The
/// chat is drawn again whenever it changes, so the players are kept by the message and the card finds its player again.
/// </summary>
public sealed class AudioCard : Grid {
    private static readonly Dictionary<string, AudioPlayer> Players = new();

    private readonly FileAttachment file;
    private readonly Func<FileAttachment, Task<string?>> fetch;
    private readonly Action fallback;

    private readonly Border disc = new() {
        Width = 40,
        Height = 40,
        CornerRadius = new CornerRadius(20),
        Margin = new Thickness(0, 0, 12, 0),
        Cursor = new Cursor(StandardCursorType.Hand),
    };

    private readonly Icon glyph = new() {
        Size = 22,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border track = new() {
        Height = 4,
        CornerRadius = new CornerRadius(2),
        VerticalAlignment = VerticalAlignment.Center,
        Cursor = new Cursor(StandardCursorType.Hand),
        Background = Brushes.Transparent,
    };

    private readonly Border fill = new() {
        Height = 4,
        CornerRadius = new CornerRadius(2),
        HorizontalAlignment = HorizontalAlignment.Left,
    };

    private readonly TextBlock time = new() {
        FontSize = 14,
        FontFamily = Fonts.System,
    };

    private readonly DispatcherTimer timer = new() {
        Interval = TimeSpan.FromMilliseconds(250)
    };

    private bool loading;

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
        ColumnDefinitions = new ColumnDefinitions("Auto,*");
        MinWidth = 220;
        disc.Background = new SolidColorBrush(mine ? colors.BubbleOutText : colors.Accent);
        glyph.Color = new SolidColorBrush(mine ? colors.BubbleOut : colors.OnAccent);
        disc.Child = glyph;
        var words = new StackPanel {
            VerticalAlignment = VerticalAlignment.Center,
            Spacing = 3
        };
        words.Children.Add(new TextBlock {
            Text = file.Name,
            FontSize = 16,
            FontWeight = FontWeight.Medium,
            FontFamily = Fonts.System,
            Foreground = fg,
            TextTrimming = TextTrimming.CharacterEllipsis,
        });
        var back = new Border {
            Height = 4,
            CornerRadius = new CornerRadius(2),
            Background = new SolidColorBrush(Color.FromArgb(70, meta.R, meta.G, meta.B)),
            VerticalAlignment = VerticalAlignment.Center,
        };
        fill.Background = fg;
        var bar = new Grid {
            Height = 14
        };
        bar.Children.Add(back);
        bar.Children.Add(fill);
        bar.Children.Add(track);
        words.Children.Add(bar);
        time.Foreground = new SolidColorBrush(meta);
        words.Children.Add(time);
        SetColumn(words, 1);
        Children.Add(disc);
        Children.Add(words);
        disc.PointerPressed += (_, e) => {
            e.Handled = true;
            _ = Toggle();
        };
        track.PointerPressed += (_, e) => {
            e.Handled = true;
            if (Players.TryGetValue(file.Source, out var player) && player.DurationMs > 0
                                                                 && track.Bounds.Width > 0)
                player.Seek((long)(player.DurationMs * e.GetPosition(track).X /
                                   track.Bounds.Width));
            Refresh();
        };
        timer.Tick += (_, _) => Refresh();
        AttachedToVisualTree += (_, _) => {
            Refresh();
            timer.Start();
        };
        DetachedFromVisualTree += (_, _) => timer.Stop();
        Refresh();
    }

    /// <summary>What the button shows now; "play" or "pause".</summary>
    public string Glyph => glyph.Glyph;

    public long Position => Players.TryGetValue(file.Source, out var p) ? p.PositionMs : 0;

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

        if (!AudioPlayer.Available) {
            fallback();
            return;
        }

        loading = true;
        try {
            var path = await fetch(file);
            if (path is null)
                return;
            var player = new AudioPlayer(path);
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
        } catch (Exception) {
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
        glyph.Glyph = playing ? "pause" : "play";
        var length = player is { DurationMs: > 0 }
            ? player.DurationMs
            : (long)(file.Duration?.TotalMilliseconds ?? 0);
        var at = player?.State == PlayState.Ended ? 0 : player?.PositionMs ?? 0;
        var share = length > 0 ? Math.Min(1.0, (double)at / length) : 0;
        fill.Width = Math.Max(0, track.Bounds.Width * share);
        time.Text = playing || at > 0
            ? $"{Format.Duration(TimeSpan.FromMilliseconds(at))} / {Format.Duration(TimeSpan.FromMilliseconds(length))}"
            : Format.Duration(TimeSpan.FromMilliseconds(length));
    }
}
