using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Primitives;
using Avalonia.Input;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using OhMatrix.Core.Audio;
using OhMatrix.Core.Model;
using OhMatrix.Core.Theming;
using OhMatrix.Core.Ui.Animations;
using OhMatrix.Core.Ui.Appearance;
using OhMatrix.Core.Ui.Support;
using OhMatrix.Core.Ui.Widgets;

namespace OhMatrix.Core.Ui.Media;

/// <summary>
/// The video of a message in the app: over a near-black backdrop, the picture fitted to the window with a play or pause button, a bar to see
/// and change where it is, and the time. A press on the picture plays or pauses; Esc, the cross or a press outside closes it.
/// </summary>
public sealed class VideoViewer : IOverlay {
    // Set when the page that owns it is thrown away: an answer that comes
    // late must not open it again over the page that is shown now.
    private bool retired;

    /// <summary>Closes it for good: it is not shown again.</summary>
    public void Retire()
    {
        retired = true;
        Stop();
        Detach();
    }

    private OverlayLayer? layer;
    private MediaPlayer? player;
    private WriteableBitmap? bitmap;

    private readonly SolidColorBrush backdrop =
        new(Color.FromArgb(250, 0, 0, 0));

    private readonly Grid shade = new() {
        Focusable = true,
        ClipToBounds = true,
    };

    // What is on the backdrop: it comes from a little less than its size as
    // the window dims.
    private readonly Grid content = new();

    private readonly Image picture = new() {
        Stretch = Stretch.Uniform,
        Margin = new Thickness(0, 56, 0, 80),
    };

    private readonly TextBlock title = new() {
        FontSize = 16,
        FontWeight = Fonts.Normal,
        Foreground = Brushes.White,
        TextTrimming = TextTrimming.CharacterEllipsis,
        VerticalAlignment = VerticalAlignment.Top,
        Margin = new Thickness(20, 12, 60, 0),
        Height = 36,
    };

    private readonly TextBlock status = new() {
        FontSize = 15,
        Foreground = Brushes.White,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly IconButton toggle = new("play", "Play", 24, 44) {
        Tint = Colors.White,
    };

    private readonly Border track = new() {
        Height = 18,
        Background = Brushes.Transparent,
        Cursor = new Cursor(StandardCursorType.Hand),
        VerticalAlignment = VerticalAlignment.Center,
    };

    private readonly Border fill = new() {
        Height = 4,
        CornerRadius = new CornerRadius(2),
        Background = Brushes.White,
        HorizontalAlignment = HorizontalAlignment.Left,
        IsHitTestVisible = false,
    };

    private readonly TextBlock time = new() {
        FontSize = 14,
        Foreground = Brushes.White,
        VerticalAlignment = VerticalAlignment.Center,
        Margin = new Thickness(12, 0, 0, 0),
    };

    private readonly DispatcherTimer timer = new() {
        Interval = TimeSpan.FromMilliseconds(33)
    };

    private int session;

    private readonly Presence presence;

    public VideoViewer()
    {
        shade.Background = backdrop;
        presence = Presences.Cover(content);
        presence.Backdrop = backdrop;
        shade.Children.Add(content);
        content.Children.Add(picture);
        content.Children.Add(status);
        content.Children.Add(title);
        var close = new IconButton("close", "Close", 26) {
            Tint = Colors.White,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 12, 12, 0),
        };
        close.Click += (_, _) => Close();
        ThemeScope.SetColors(close, Themes.Resolve("dark", null).Colors);
        ThemeScope.SetColors(toggle, Themes.Resolve("dark", null).Colors);
        content.Children.Add(close);

        var bar = new Grid {
            ColumnDefinitions = new ColumnDefinitions("Auto,*,Auto"),
            VerticalAlignment = VerticalAlignment.Bottom,
            Margin = new Thickness(20, 0, 20, 20),
            Height = 44,
        };
        var line = new Grid {
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(12, 0, 0, 0)
        };
        line.Children.Add(new Border {
            Height = 4,
            CornerRadius = new CornerRadius(2),
            Background = new SolidColorBrush(Color.FromArgb(90, 255, 255, 255)),
            VerticalAlignment = VerticalAlignment.Center,
        });
        line.Children.Add(fill);
        line.Children.Add(track);
        Grid.SetColumn(line, 1);
        Grid.SetColumn(time, 2);
        bar.Children.Add(toggle);
        bar.Children.Add(line);
        bar.Children.Add(time);
        content.Children.Add(bar);

        toggle.Click += (_, _) => Toggle();
        picture.PointerPressed += (_, e) => {
            e.Handled = true;
            Toggle();
        };
        track.PointerPressed += (_, e) => {
            e.Handled = true;
            if (player is { DurationMs: > 0 } p && track.Bounds.Width > 0)
                p.Seek((long)(p.DurationMs * e.GetPosition(track).X /
                              track.Bounds.Width));
        };
        shade.PointerPressed += (_, e) => {
            if (e.Source == shade)
                Close();
        };
        shade.KeyDown += (_, e) => {
            if (e.Key == Key.Escape)
                Close();
            else if (e.Key == Key.Space)
                Toggle();
        };
        timer.Tick += (_, _) => Tick();
    }

    /// <summary>It is shown and not on its way out: a viewer that is fading away has been closed.</summary>
    public bool IsOpen => shade.Parent != null && !presence.Leaving;

    /// <summary>What the play button shows now: "play" or "pause".</summary>
    public string Glyph => toggle.Glyph;

    public Image Picture => picture;

    public long Position => player?.PositionMs ?? 0;

    /// <summary>Opens the video: it is fetched, then played from the start.</summary>
    public async Task Show(TopLevel window, FileAttachment file,
        Func<FileAttachment, Task<string?>> fetch)
    {
        Stop();
        Detach();
        layer = retired ? null : OverlayLayer.GetOverlayLayer(window);
        if (layer == null)
            return;
        var mine = ++session;
        title.Text = file.Name;
        picture.Source = null;
        bitmap = null;
        status.Text = "…";
        shade.Width = window.ClientSize.Width;
        shade.Height = window.ClientSize.Height;
        content.Width = shade.Width;
        content.Height = shade.Height;
        shade.IsHitTestVisible = true;
        layer.Children.Add(shade);
        presence.Enter();
        shade.Focus();
        string? path = null;
        try {
            path = await fetch(file);
        } catch (Exception) {
            // Nothing to play: the viewer closes below.
        }

        // Closed, or another video opened, while it was being fetched.
        if (mine != session || !IsOpen)
            return;
        var next = path == null ? null : new MediaPlayer(path, true);
        if (next == null || !next.Play()) {
            next?.Dispose();
            Close();
            return;
        }

        player = next;
        status.Text = "";
        timer.Start();
    }

    private void Toggle()
    {
        if (player == null)
            return;
        if (player.State == PlayState.Playing)
            player.Pause();
        else
            player.Play();
        Tick();
    }

    /// <summary>Takes the newest frame, if there is one, and shows where the video is.</summary>
    public void Tick()
    {
        var p = player;
        if (p == null)
            return;
        p.Video?.TryTakeFrame((data, width, height) => {
            if (bitmap == null || bitmap.PixelSize.Width != width ||
                bitmap.PixelSize.Height != height) {
                bitmap = new WriteableBitmap(new PixelSize(width, height),
                    new Vector(96, 96),
                    PixelFormat.Bgra8888, AlphaFormat.Opaque);
                picture.Source = bitmap;
            }

            using var frame = bitmap.Lock();
            for (var y = 0; y < height; y++) {
                unsafe {
                    Buffer.MemoryCopy((byte*)data + y * width * 4,
                        (byte*)frame.Address + y * frame.RowBytes,
                        frame.RowBytes, width * 4);
                }
            }

            picture.InvalidateVisual();
        });
        var playing = p.State == PlayState.Playing;
        toggle.Glyph = playing ? "pause" : "play";
        var length = p.DurationMs;
        var at = p.State == PlayState.Ended ? length : p.PositionMs;
        fill.Width = length > 0
            ? track.Bounds.Width * Math.Min(1.0, (double)at / length)
            : 0;
        time.Text = $"{Format.Duration(TimeSpan.FromMilliseconds(at))} / "
                    + Format.Duration(TimeSpan.FromMilliseconds(length));
    }

    /// <summary>Closes it: the video stops at once, the picture fades away, and what is under it can be pressed.</summary>
    public void Close()
    {
        Stop();
        if (shade.Parent == null || presence.Leaving)
            return;
        shade.IsHitTestVisible = false;
        presence.Leave(Remove);
    }

    // Ends what is playing, and what is waited for.
    private void Stop()
    {
        session++;
        timer.Stop();
        player?.Dispose();
        player = null;
    }

    // Takes it away without a motion: for a video that is shown again at
    // once and for a page that is thrown away.
    private void Detach()
    {
        presence.Cancel();
        Remove();
    }

    private void Remove()
    {
        layer?.Children.Remove(shade);
    }
}
